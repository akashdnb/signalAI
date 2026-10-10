import type { PgBoss } from "pg-boss";
import type { Pool } from "pg";
import { pruneExpiredNonces } from "../db/oauthNonces.js";
import { pruneOldAiCallUsage } from "../db/aiCallUsage.js";
import { pruneExpiredOtpCodes } from "../db/emailOtpCodes.js";
import { BACKGROUND_POLL, ensureNotifyQueue } from "./boss.js";
import { enqueueUnknownUsernameResolutionJobs } from "./usernameResolutionQueue.js";

export const MAINTENANCE_QUEUE = "maintenance";
// Off the :00 mark on purpose — every deploy that defaults to an hourly
// cron lands on the exact hour, which means nothing here, but it's a cheap
// habit that costs nothing to keep.
const MAINTENANCE_CRON = "17 * * * *";

/**
 * R8-01 fix: pruning used to run only once, at boot — fine for a process that
 * restarts often, wrong for one designed to stay up for weeks between deploys.
 * pg-boss already has a scheduler; registering a recurring job here makes the
 * guarantee independent of deploy cadence.
 *
 * Username repair is also scheduled here so a lead that remains unresolved
 * after the initial queue attempts is retried without requiring a deploy or
 * manual database intervention.
 */
export async function ensureMaintenanceQueue(boss: PgBoss): Promise<void> {
  await ensureNotifyQueue(boss, MAINTENANCE_QUEUE);
  await boss.schedule(MAINTENANCE_QUEUE, MAINTENANCE_CRON, {}, { tz: "UTC" });
}

export function startMaintenanceWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work(MAINTENANCE_QUEUE, BACKGROUND_POLL, async () => {
    await pruneExpiredNonces(pool);
    await pruneOldAiCallUsage(pool);
    await pruneExpiredOtpCodes(pool);

    const repaired = await enqueueUnknownUsernameResolutionJobs(pool, boss, 100);
    if (repaired > 0) {
      // eslint-disable-next-line no-console
      console.info(`Queued ${repaired} Instagram username backfill job(s)`);
    }
  });
}
