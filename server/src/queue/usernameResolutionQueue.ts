import type { PgBoss } from "pg-boss";
import type { Pool, PoolClient } from "pg";
import { asPgBossDb } from "./leadEventsQueue.js";
import { getSoleConnectedAccount, getDecryptedToken } from "../db/tokens.js";
import { hasKnownUsername, backfillLeadPiiUsername, listLeadsMissingInstagramUsername } from "../db/pii.js";
import { fetchInstagramUsername } from "../lib/instagramProfile.js";
import { Sentry } from "../lib/sentry.js";
import { FAST_POLL, ensureNotifyQueue } from "./boss.js";

export const USERNAME_RESOLUTION_QUEUE = "username-resolution";

export interface ResolveUsernameJob {
  tenantId: string;
  leadId: string;
  leadEventId: string;
  instagramUserId: string;
}

export async function ensureUsernameResolutionQueue(boss: PgBoss): Promise<void> {
  await ensureNotifyQueue(boss, USERNAME_RESOLUTION_QUEUE, {
    retryLimit: 5,
    retryBackoff: true,
  });
}

/**
 * `client`, when passed, rides the caller's own ingest transaction — the
 * username job is committed atomically with the event it enriches.
 */
export async function enqueueUsernameResolution(
  boss: PgBoss,
  job: ResolveUsernameJob,
  options?: { client?: PoolClient },
): Promise<void> {
  await boss.send(USERNAME_RESOLUTION_QUEUE, job, {
    singletonKey: `${job.tenantId}:${job.instagramUserId}`,
    ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
  });
}

/**
 * Re-enqueues existing leads that were created before username resolution was
 * reliable, or whose earlier lookup exhausted its retries. This is deliberately
 * bounded and idempotent so it can run at boot and from hourly maintenance.
 */
export async function enqueueUnknownUsernameResolutionJobs(
  pool: Pool,
  boss: PgBoss,
  limit = 100,
): Promise<number> {
  const candidates = await listLeadsMissingInstagramUsername(pool, limit);

  for (const candidate of candidates) {
    await enqueueUsernameResolution(boss, candidate);
  }

  return candidates.length;
}

/**
 * Best-effort enrichment. Missing account/token is treated as a skip because
 * the lead pipeline must not fail when a creator disconnects. Genuine Graph
 * API/network failures are thrown so pg-boss retries them with backoff.
 */
export function startUsernameResolutionWorker(
  boss: PgBoss,
  pool: Pool,
  keyring: Map<string, Buffer>,
): Promise<string> {
  return boss.work<ResolveUsernameJob>(USERNAME_RESOLUTION_QUEUE, FAST_POLL, async (jobs) => {
    for (const job of jobs) {
      const { tenantId, leadId, leadEventId, instagramUserId } = job.data;

      // A comment (or an earlier resolution) may have supplied a username
      // for this lead already, between enqueue and now — skip the Graph API
      // call entirely rather than overwrite/duplicate work.
      if (await hasKnownUsername(pool, tenantId, leadId)) continue;

      const account = await getSoleConnectedAccount(pool, tenantId);
      if (!account) continue;

      const token = await getDecryptedToken(
        pool,
        keyring,
        tenantId,
        account.instagramAccountId,
      );
      if (!token) continue;

      try {
        const username = await fetchInstagramUsername(token, instagramUserId);
        if (username) {
          await backfillLeadPiiUsername(pool, tenantId, leadEventId, username);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Username resolution failed:", err);
        Sentry.captureException(err);
        throw err; // pg-boss applies retryLimit/retryBackoff from the queue.
      }
    }
  });
}
