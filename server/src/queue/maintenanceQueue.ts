import type { PgBoss } from "pg-boss";
import type { Pool } from "pg";
import { pruneExpiredNonces } from "../db/oauthNonces.js";
import { pruneOldAiCallUsage } from "../db/aiCallUsage.js";
import { pruneExpiredMagicLinkTokens } from "../db/magicLinkTokens.js";

export const MAINTENANCE_QUEUE = "maintenance";
// Off the :00 mark on purpose — every deploy that defaults to an hourly
// cron lands on the exact hour, which means nothing here, but it's a cheap
// habit that costs nothing to keep.
const MAINTENANCE_CRON = "17 * * * *";

/**
 * R8-01 fix: `pruneExpiredNonces`/`pruneOldAiCallUsage` previously ran only
 * once, at boot — fine for a process that restarts often, wrong for one
 * designed to stay up for weeks between deploys (a Render instance).
 * `ai_call_usage` in particular is read on every single AI-generated
 * reply, so it's the table that grows fastest between deploys. pg-boss
 * already has a scheduler; registering a recurring job here costs little
 * and makes the guarantee independent of deploy cadence. Boot-time pruning
 * (index.ts) stays too — belt and suspenders for a long gap between the
 * first schedule tick and the next deploy.
 *
 * account_sends is deliberately NOT pruned here — see accountSends.ts's
 * `pruneOldSends` docstring for why it's now a durable analytics source.
 */
export async function ensureMaintenanceQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(MAINTENANCE_QUEUE);
  await boss.schedule(MAINTENANCE_QUEUE, MAINTENANCE_CRON, {}, { tz: "UTC" });
}

export function startMaintenanceWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work(MAINTENANCE_QUEUE, async () => {
    await pruneExpiredNonces(pool);
    await pruneOldAiCallUsage(pool);
    await pruneExpiredMagicLinkTokens(pool);
  });
}
