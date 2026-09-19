import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { getTenant, getTenantByStripeCustomerId, setBillingStatus, setStripeCustomerId } from "../db/tenants.js";
import { getStripeClient, isBillingConfigured } from "../lib/stripeClient.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { isWebhookEventAlreadyProcessed, recordWebhookEventProcessed } from "../db/stripeWebhookEvents.js";
import { Sentry } from "../lib/sentry.js";

export const billingRouter = Router();

// R10-01 fix: the two tenant-scoped routes below are gated on the bearer
// session. /billing/webhook is deliberately excluded — it's Stripe's own
// call, authenticated by its signature instead (see that route), and
// doesn't match this "/tenants/:tenantId" prefix regardless.
billingRouter.use("/tenants/:tenantId", requireTenantSession);

/**
 * B11: Single Flat Plan via Stripe Checkout (roadmap Phase 1 Billing) —
 * one price, one button, one tier. Degrades to a clear 503 rather than
 * crashing when Stripe isn't configured (dev/test, or before the user has
 * a real Stripe account) — same shape as the LLM provider's graceful
 * degradation.
 */
billingRouter.post("/tenants/:tenantId/billing/checkout", async (req, res) => {
  if (!isBillingConfigured()) {
    return res.status(503).json({ error: "billing is not configured on this server" });
  }

  const { tenantId } = req.params;
  const pool = getPool();
  const tenant = await getTenant(pool, tenantId);
  if (!tenant) {
    return res.status(404).json({ error: "tenant not found" });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      // client_reference_id is how the webhook resolves this session back
      // to a tenant when it has no other Stripe identifier yet.
      client_reference_id: tenant.id,
      customer: tenant.stripeCustomerId ?? undefined,
      success_url: `${config.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appBaseUrl}/billing/cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to create Stripe Checkout session:", err);
    Sentry.captureException(err);
    return res.status(502).json({ error: "failed to start checkout" });
  }
});

billingRouter.get("/tenants/:tenantId/billing", async (req, res) => {
  const tenant = await getTenant(getPool(), req.params.tenantId);
  if (!tenant) {
    return res.status(404).json({ error: "tenant not found" });
  }
  return res.status(200).json({
    billingStatus: tenant.billingStatus,
    billingConfigured: isBillingConfigured(),
  });
});

/**
 * The webhook — not the Checkout success redirect — is the only source of
 * truth for activation. A browser landing on `success_url` proves the
 * customer completed the Checkout UI, not that Stripe has actually settled
 * payment; relying on the redirect would let a tenant self-report as paid
 * by hand-typing the success URL.
 */
billingRouter.post("/billing/webhook", async (req, res) => {
  if (!isBillingConfigured() || !config.stripeWebhookSecret) {
    return res.status(503).json({ error: "billing is not configured on this server" });
  }

  const signature = req.header("stripe-signature");
  if (!signature || !req.rawBody) {
    return res.status(400).json({ error: "missing signature or body" });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Stripe webhook signature verification failed:", err);
    return res.status(400).json({ error: "invalid signature" });
  }

  const pool = getPool();
  try {
    // R10-03 fix: recorded AFTER processing succeeds, not before — marking
    // an event "seen" before its handler actually completes would let a
    // transient failure (this whole block throwing, below) permanently
    // burn the dedup slot: Stripe's retry (triggered by our own 500) would
    // then be wrongly treated as an already-processed duplicate and
    // skipped, even though nothing ever actually happened. Checked first
    // so a genuine redelivery of an event we already finished is a no-op.
    if (await isWebhookEventAlreadyProcessed(pool, event.id)) {
      return res.sendStatus(200);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const tenantId = session.client_reference_id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (tenantId && customerId) {
          await setStripeCustomerId(pool, tenantId, customerId);
          await setBillingStatus(pool, tenantId, "active", subscriptionId ?? null);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        if (customerId) {
          const tenant = await getTenantByStripeCustomerId(pool, customerId);
          // R10-02 fix: only cancel if the deleted subscription is still
          // the tenant's CURRENT one. Stripe doesn't guarantee ordering —
          // cancel, resubscribe, then a retried/delayed deletion event for
          // the OLD subscription arriving after the new
          // checkout.session.completed would otherwise mark a paying
          // tenant canceled.
          if (tenant && tenant.stripeSubscriptionId === subscription.id) {
            await setBillingStatus(pool, tenant.id, "canceled");
          }
        }
        break;
      }
      default:
        // Every other event type is intentionally ignored — one flat
        // plan, no metered usage, no invoice-level logic in Phase 1.
        break;
    }
    await recordWebhookEventProcessed(pool, event.id, event.type);
    return res.sendStatus(200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Stripe webhook handling failed:", err);
    Sentry.captureException(err);
    // A non-2xx makes Stripe retry, same reasoning as the Meta webhook.
    return res.sendStatus(500);
  }
});
