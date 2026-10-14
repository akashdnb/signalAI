import type { Pool } from "pg";
import { config } from "../config.js";
import { getDailyTokenTotals } from "../db/tokenUsage.js";
import { upsertDailyUsageRollup, listUnsyncedRollups, markRollupSynced } from "../db/dailyUsageRollup.js";
import { getTenant } from "../db/tenants.js";
import { getWorkspaceCoverage, getBillingAccount } from "../db/billingAccounts.js";
import { getStripeClient, isBillingConfigured } from "../lib/stripeClient.js";
import { Sentry } from "../lib/sentry.js";

function yesterdayUtcDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Phase 2B "Daily Usage Rollup": aggregates the previous UTC day's
 * token_usage rows into one daily_usage_rollup row per tenant. Meant to
 * run once a day (see queue/maintenanceQueue.ts) — safe to re-run for the
 * same date, since upsertDailyUsageRollup always SETS the day's total
 * (never increments), so a re-run just recomputes the same figure from
 * the same source rows.
 */
export async function runDailyUsageRollup(pool: Pool, date: string = yesterdayUtcDateString()): Promise<number> {
  const totals = await getDailyTokenTotals(pool, date);
  for (const total of totals) {
    await upsertDailyUsageRollup(pool, {
      tenantId: total.tenantId,
      usageDate: date,
      promptTokens: total.promptTokens,
      completionTokens: total.completionTokens,
    });
  }
  return totals.length;
}

/**
 * "Aggregate internally first; sync to Stripe periodically rather than
 * calling it per token event." A rollup with nothing to report to Stripe
 * (no active paid subscription, or Stripe/the meter not configured) is
 * still marked resolved here — there's no report to retry, so leaving it
 * perpetually "unsynced" would just waste every future run re-checking a
 * tenant that will never have anything to sync. The internal ledger
 * (token_usage/daily_usage_rollup) stays the source of truth regardless;
 * this is strictly a best-effort external mirror of it.
 */
export async function syncUsageRollupsToStripe(pool: Pool): Promise<{ reported: number; resolved: number }> {
  const rollups = await listUnsyncedRollups(pool);
  let reported = 0;
  let resolved = 0;

  for (const rollup of rollups) {
    // Agency Bulk Billing: a plan-covered workspace reports its usage under
    // the PLAN's Stripe customer, not its own. Multiple covered workspaces'
    // same-day meter events share that customer (each keeps its own unique
    // identifier = rollup.id, so none is deduped away) and Stripe sums them
    // into the plan's single metered line — the aggregate the agency pays.
    // A workspace with no active plan falls back to its own per-tenant
    // subscription, exactly as before.
    const coverage = await getWorkspaceCoverage(pool, rollup.tenantId);
    let reportCustomerId: string | null = null;
    if (coverage && coverage.billingStatus === "active") {
      const account = await getBillingAccount(pool, coverage.billingAccountId);
      reportCustomerId = account?.stripeCustomerId ?? null;
    } else {
      const tenant = await getTenant(pool, rollup.tenantId);
      if (tenant?.billingStatus === "active") reportCustomerId = tenant.stripeCustomerId;
    }

    const canReport = isBillingConfigured() && !!config.stripeMeterEventName && !!reportCustomerId;

    if (!canReport) {
      await markRollupSynced(pool, rollup.id);
      resolved++;
      continue;
    }

    try {
      const stripe = getStripeClient();
      const totalTokens = rollup.promptTokens + rollup.completionTokens;
      // Stripe Billing Meter Events: one event per (tenant, day) reported to
      // whichever customer actually pays (the plan's, or the tenant's own) —
      // the meter (named by stripeMeterEventName) turns this into a metered
      // line item on that customer's subscription.
      await stripe.billing.meterEvents.create({
        event_name: config.stripeMeterEventName,
        payload: { value: String(totalTokens), stripe_customer_id: reportCustomerId! },
        timestamp: Math.floor(new Date(rollup.usageDate).getTime() / 1000),
        // Stripe enforces uniqueness on this within a rolling 24h+ window
        // — rollup.id is stable per (tenant, day), so a retry after the
        // Stripe call succeeded but markRollupSynced then failed can't
        // double-report the same day's usage.
        identifier: rollup.id,
      });
      await markRollupSynced(pool, rollup.id);
      reported++;
    } catch (err) {
      // Left unsynced on purpose — the next run's listUnsyncedRollups
      // picks it back up. A Stripe outage or a misconfigured meter must
      // never lose usage data, only delay reporting it.
      // eslint-disable-next-line no-console
      console.error(`[usage-rollup] Stripe sync failed for tenant ${rollup.tenantId}, ${rollup.usageDate}:`, err);
      Sentry.captureException(err);
    }
  }

  return { reported, resolved };
}
