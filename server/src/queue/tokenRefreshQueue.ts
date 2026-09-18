import type { PgBoss, Job } from "pg-boss";
import type { Pool } from "pg";
import { runTokenRefreshSweep } from "../services/tokenRefreshJob.js";

export const TOKEN_REFRESH_QUEUE = "token-refresh";

export async function ensureTokenRefreshQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(TOKEN_REFRESH_QUEUE);
  // Every 6 hours is frequent enough that a token sitting in the 5-day
  // refresh window never waits long, without polling constantly for what
  // is, day to day, an empty result.
  await boss.schedule(TOKEN_REFRESH_QUEUE, "0 */6 * * *", {});
}

export function startTokenRefreshWorker(
  boss: PgBoss,
  pool: Pool,
  keyring: Map<string, Buffer>,
  onResults?: (results: Awaited<ReturnType<typeof runTokenRefreshSweep>>) => Promise<void>,
): Promise<string> {
  return boss.work(TOKEN_REFRESH_QUEUE, async (jobs: Job[]) => {
    for (const _job of jobs) {
      const results = await runTokenRefreshSweep(pool, keyring);
      if (onResults && results.length > 0) {
        await onResults(results);
      }
    }
  });
}
