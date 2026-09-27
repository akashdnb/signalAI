import type { PgBoss } from "pg-boss";
import type { Pool } from "pg";
import { runDailyUsageRollup, syncUsageRollupsToStripe } from "../services/usageRollupService.js";
import { Sentry } from "../lib/sentry.js";

export const USAGE_ROLLUP_QUEUE = "usage-rollup";
// Once a day, well after midnight UTC — gives every timezone's "yesterday"
// time to fully land in token_usage before the rollup reads it. A
// separate queue from maintenanceQueue (hourly) rather than folded in:
// this is a once-a-day billing-adjacent job, not a same-cadence prune.
const USAGE_ROLLUP_CRON = "30 2 * * *";

export async function ensureUsageRollupQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(USAGE_ROLLUP_QUEUE);
  await boss.schedule(USAGE_ROLLUP_QUEUE, USAGE_ROLLUP_CRON, {}, { tz: "UTC" });
}

/**
 * Phase 2B "Daily Usage Rollup -> Stripe Metered Billing", run end to end:
 * aggregate yesterday's token_usage into daily_usage_rollup, then attempt
 * to sync whatever's still unsynced (which can include older days that
 * failed a previous sync attempt, not just yesterday's).
 */
export function startUsageRollupWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work(USAGE_ROLLUP_QUEUE, async () => {
    try {
      await runDailyUsageRollup(pool);
      await syncUsageRollupsToStripe(pool);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[usage-rollup] daily job failed:", err);
      Sentry.captureException(err);
    }
  });
}
