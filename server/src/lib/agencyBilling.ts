import { config } from "../config.js";
import { getStripeClient, isBillingConfigured } from "./stripeClient.js";
import { Sentry } from "./sentry.js";
import type { BillingAccount } from "../db/billingAccounts.js";

/**
 * Agency Bulk Billing — Stripe wiring (docs/AGENCY_WORKSPACES_AND_BULK_BILLING_PLAN.md §4).
 *
 * One Customer, one subscription, licensed per-workspace quantity. The
 * subscription's quantity tracks how many workspaces the plan covers; the
 * metered token line rides on the same subscription and is fed by the usage
 * rollup (aggregated to this Customer — see services/usageRollupService.ts).
 * Deliberately NOT Stripe Connect: an agency paying for its clients from one
 * card is a single payer, not separate legal entities.
 */

export function isAgencyBillingConfigured(): boolean {
  return isBillingConfigured() && Boolean(config.stripeAgencyPriceId);
}

/** Stripe licensed quantity must be >= 1; a plan with zero covered workspaces still holds one seat. */
function seatQuantity(coveredCount: number): number {
  return Math.max(1, coveredCount);
}

export async function createAgencyCheckoutSession(
  billingAccount: BillingAccount,
  coveredCount: number,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: config.stripeAgencyPriceId, quantity: seatQuantity(coveredCount) }],
    // client_reference_id namespaces this session as a billing-account (not a
    // tenant) checkout, so the shared webhook routes it correctly.
    client_reference_id: `ba:${billingAccount.id}`,
    metadata: { billingAccountId: billingAccount.id },
    customer: billingAccount.stripeCustomerId ?? undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/**
 * Best-effort: push the covered-workspace count to the subscription's licensed
 * quantity after an add/remove. The coverage change is already committed in
 * our own ledger (the source of truth); a Stripe hiccup here must not fail the
 * request, only log so it can be reconciled. No-op when the plan has no active
 * subscription yet (the next checkout sets the right quantity from scratch).
 */
export async function syncAgencySubscriptionQuantity(
  billingAccount: BillingAccount,
  coveredCount: number,
): Promise<void> {
  if (!isAgencyBillingConfigured() || !billingAccount.stripeSubscriptionId) return;
  try {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(billingAccount.stripeSubscriptionId);
    // The licensed seat item — the one that isn't the metered token line.
    const item =
      subscription.items.data.find((i) => i.price?.recurring?.usage_type !== "metered") ??
      subscription.items.data[0];
    if (!item) return;
    await stripe.subscriptionItems.update(item.id, { quantity: seatQuantity(coveredCount) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[agency-billing] failed to sync subscription quantity for ${billingAccount.id}:`, err);
    Sentry.captureException(err);
  }
}
