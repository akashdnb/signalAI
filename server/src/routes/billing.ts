import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import {
  getTenant,
  getTenantByStripeCustomerId,
  setBillingStatus,
  setStripeCustomerId,
  setPlanTier,
} from "../db/tenants.js";
import { getStripeClient, isBillingConfigured } from "../lib/stripeClient.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { isWebhookEventAlreadyProcessed, recordWebhookEventProcessed } from "../db/stripeWebhookEvents.js";
import {
  getBillingAccount,
  getBillingAccountByStripeCustomerId,
  setBillingAccountStripeCustomer,
  setBillingAccountStatus,
} from "../db/billingAccounts.js";
import { getPlanTier, resolvePriceIdForTier, type PlanTier } from "../lib/planTiers.js";
import { resolveEffectiveBilling, billingCycleStart } from "../services/billingResolver.js";
import { estimateOverageCost } from "../lib/overage.js";
import { getTokenUsageSince } from "../db/tokenUsage.js";
import { countSendsSince } from "../db/accountSends.js";
import { Sentry } from "../lib/sentry.js";

const PAID_TIERS: PlanTier[] = ["starter", "growth"];

export const billingRouter = Router();

// R10-01 fix: the two tenant-scoped routes below are gated on the bearer
// session. /billing/webhook is deliberately excluded — it's Stripe's own
// call, authenticated by its signature instead (see that route), and
// doesn't match this "/tenants/:tenantId" prefix regardless.
billingRouter.use("/tenants/:tenantId", requireTenantSession);

/**
 * Phase 2B Plan Tiers, extending B11's Single Flat Plan Checkout: the
 * flat plan was always really the 'starter' tier under a different name
 * (stripeStarterPriceId falls back to the original STRIPE_PRICE_ID — see
 * config.ts), so an existing pilot's Checkout link keeps working
 * unchanged. `tier` defaults to 'starter' for the same reason — an old
 * client calling this route with no body still gets the flat plan.
 * Degrades to a clear 503 rather than crashing when Stripe isn't
 * configured (dev/test, or before the user has a real Stripe account) —
 * same shape as the LLM provider's graceful degradation.
 */
billingRouter.post("/tenants/:tenantId/billing/checkout", async (req, res) => {
  if (!isBillingConfigured()) {
    return res.status(503).json({ error: "billing is not configured on this server" });
  }

  const { tenantId } = req.params;
  const requestedTier: PlanTier = PAID_TIERS.includes(req.body?.tier) ? req.body.tier : "starter";
  const priceId = resolvePriceIdForTier(requestedTier);
  if (!priceId) {
    return res.status(503).json({ error: `the '${requestedTier}' tier is not configured on this server` });
  }

  const pool = getPool();
  const tenant = await getTenant(pool, tenantId);
  if (!tenant) {
    return res.status(404).json({ error: "tenant not found" });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id is how the webhook resolves this session back
      // to a tenant when it has no other Stripe identifier yet. metadata
      // carries which TIER was purchased — the webhook's
      // checkout.session.completed event has no other reliable way to
      // learn this without a second round-trip to fetch line items.
      client_reference_id: tenant.id,
      metadata: { planTier: requestedTier },
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
  const tierDef = getPlanTier(tenant.planTier);
  return res.status(200).json({
    billingStatus: tenant.billingStatus,
    billingConfigured: isBillingConfigured(),
    planTier: tenant.planTier,
    planTierLabel: tierDef.label,
    quotas: {
      dmsPerMonth: tierDef.dmsPerMonth,
      connectedAccounts: tierDef.connectedAccounts,
      campaigns: tierDef.campaigns,
      tokenAllowance: tierDef.tokenAllowance,
    },
    trialEndsAt: tenant.trialEndsAt,
    availableTiers: PAID_TIERS.filter((tier) => resolvePriceIdForTier(tier) !== null).map((tier) => ({
      tier,
      label: getPlanTier(tier).label,
      dmsPerMonth: getPlanTier(tier).dmsPerMonth,
      connectedAccounts: getPlanTier(tier).connectedAccounts,
      campaigns: getPlanTier(tier).campaigns,
      tokenAllowance: getPlanTier(tier).tokenAllowance,
    })),
  });
});

/**
 * Phase 2B Usage Visibility Dashboard + Soft-Cap Quota Enforcement:
 * "tenant-facing, so consumption is visible before an invoice, not
 * after," and "warn as a tenant approaches their tier limit; don't
 * hard-block mid-campaign — the hard per-account AI spend ceiling stays
 * underneath as the backstop." This route is purely informational: it
 * never blocks a send itself (that's still the Phase 1 spend guard,
 * extended in Phase 2B for trial token allowance — see
 * leadEventReplyHandler.ts), it just tells the tenant where they stand.
 *
 * The billing cycle start is trial_started_at for a trial tenant (the
 * WHOLE trial is one cycle, per the Trial Token Allowance design) or the
 * 1st of the current UTC month for a paid tenant — an approximation of a
 * real Stripe billing-cycle anchor, close enough for a dashboard estimate
 * and consistent with the "this is an estimate, Stripe is authoritative"
 * framing already established for overage cost.
 */
billingRouter.get("/tenants/:tenantId/usage", async (req, res) => {
  const pool = getPool();
  const tenant = await getTenant(pool, req.params.tenantId);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });

  const now = new Date();
  // Agency Bulk Billing: effective billing decides the token allowance and
  // entitlement — a plan-covered workspace draws from the shared pool and the
  // (optional) per-workspace cap, not its own tier. DMs stay per-workspace:
  // the plan governs tokens + seats, not Meta's send limit.
  const effective = await resolveEffectiveBilling(pool, tenant, now);
  const cycleStart = billingCycleStart(effective, now);

  const [usage, dmsSent] = await Promise.all([
    getTokenUsageSince(pool, tenant.id, cycleStart),
    countSendsSince(pool, tenant.id, cycleStart),
  ]);

  const tierDef = getPlanTier(tenant.planTier);
  // This workspace's own effective token ceiling:
  //  - plan + per-workspace cap  -> the cap (a real per-workspace ceiling)
  //  - plan, uncapped            -> null: the shared pool is NOT this one
  //    workspace's personal allowance, so reporting it here (against a single
  //    workspace's usage) is misleading. Pool-level usage lives on
  //    GET /me/billing-account instead.
  //  - own billing               -> the tier allowance
  const tokenAllowance =
    effective.source === "plan"
      ? effective.perWorkspaceTokenCap // number (cap) or null (uncapped pool)
      : effective.tokenAllowance;
  const tokenOverage = tokenAllowance === null ? 0 : Math.max(0, usage.totalTokens - tokenAllowance);
  const SOFT_CAP_WARNING_THRESHOLD = 0.8;

  const isTrialExpired = effective.isTrial && !!effective.trialEndsAt && effective.trialEndsAt < now;

  return res.status(200).json({
    billingSource: effective.source,
    planTier: tenant.planTier,
    planTierLabel: effective.planLabel,
    cycleStart,
    trialEndsAt: effective.trialEndsAt,
    isTrialExpired,
    isEntitled: effective.isEntitled,
    tokens: {
      used: usage.totalTokens,
      allowance: tokenAllowance,
      perWorkspaceTokenCap: effective.perWorkspaceTokenCap,
      overage: tokenOverage,
      estimatedOverageCostUsd: estimateOverageCost(tokenOverage),
      nearingLimit: tokenAllowance !== null && tokenAllowance > 0 && usage.totalTokens >= tokenAllowance * SOFT_CAP_WARNING_THRESHOLD,
    },
    dms: {
      sent: dmsSent,
      allowance: tierDef.dmsPerMonth,
      nearingLimit: dmsSent >= tierDef.dmsPerMonth * SOFT_CAP_WARNING_THRESHOLD,
    },
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
        const reference = session.client_reference_id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        // Agency Bulk Billing: a billing-account checkout namespaces its
        // reference as `ba:<id>`. Activate the PLAN (not a tenant) — every
        // workspace it covers becomes entitled through the resolver, with no
        // per-tenant writes.
        if (reference?.startsWith("ba:") && customerId) {
          const billingAccountId = reference.slice("ba:".length);
          if (await getBillingAccount(pool, billingAccountId)) {
            await setBillingAccountStripeCustomer(pool, billingAccountId, customerId);
            await setBillingAccountStatus(pool, billingAccountId, "active", subscriptionId ?? null);
          }
          break;
        }

        const tenantId = reference;
        if (tenantId && customerId) {
          await setStripeCustomerId(pool, tenantId, customerId);
          await setBillingStatus(pool, tenantId, "active", subscriptionId ?? null);
          // Phase 2B Plan Tiers: read back from the metadata stamped at
          // Checkout creation (see the /checkout route above) — the only
          // reliable way to learn which tier a session was for without a
          // second Stripe API call to fetch line items. Falls back to
          // 'starter' for a session created before this metadata existed
          // (or by an old client), matching the checkout route's own
          // default.
          const planTier: PlanTier = PAID_TIERS.includes(session.metadata?.planTier as PlanTier)
            ? (session.metadata!.planTier as PlanTier)
            : "starter";
          await setPlanTier(pool, tenantId, planTier);
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
          // Agency Bulk Billing: the same customer could instead be a billing
          // account. Same stale-event guard applies — only cancel the plan if
          // the deleted subscription is still its current one.
          const account = await getBillingAccountByStripeCustomerId(pool, customerId);
          if (account && account.stripeSubscriptionId === subscription.id) {
            await setBillingAccountStatus(pool, account.id, "canceled");
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        // Agency Bulk Billing: reflect a plan going past_due / back to active.
        // (Per-tenant subscriptions have no non-active/canceled states wired
        // up, so this only maps billing accounts.)
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        if (customerId) {
          const account = await getBillingAccountByStripeCustomerId(pool, customerId);
          if (account && account.stripeSubscriptionId === subscription.id) {
            const mapped =
              subscription.status === "active" || subscription.status === "trialing"
                ? "active"
                : subscription.status === "past_due" || subscription.status === "unpaid"
                  ? "past_due"
                  : subscription.status === "canceled"
                    ? "canceled"
                    : null;
            if (mapped) await setBillingAccountStatus(pool, account.id, mapped);
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
