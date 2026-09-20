import type { PgBoss } from "pg-boss";
import type { Pool, PoolClient } from "pg";
import { asPgBossDb } from "./leadEventsQueue.js";
import { getSoleConnectedAccount, getDecryptedToken } from "../db/tokens.js";
import { hasKnownUsername, backfillLeadPiiUsername } from "../db/pii.js";
import { fetchInstagramUsername } from "../lib/instagramProfile.js";
import { Sentry } from "../lib/sentry.js";

export const USERNAME_RESOLUTION_QUEUE = "username-resolution";

export interface ResolveUsernameJob {
  tenantId: string;
  leadId: string;
  leadEventId: string;
  instagramUserId: string;
}

export async function ensureUsernameResolutionQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(USERNAME_RESOLUTION_QUEUE);
}

/**
 * `client`, when passed, rides the caller's own ingest transaction (same
 * pattern as `enqueueNewLeadAlert`) — the resolution job commits or rolls
 * back atomically with the event it's resolving a username for.
 */
export async function enqueueUsernameResolution(
  boss: PgBoss,
  job: ResolveUsernameJob,
  options?: { client?: PoolClient },
): Promise<void> {
  await boss.send(USERNAME_RESOLUTION_QUEUE, job, {
    ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
  });
}

/**
 * Best-effort enrichment, not the main lead pipeline: a failure here means
 * a lead keeps showing "(unknown)" in the dashboard, not a dropped event,
 * so each of the "nothing to do" outcomes below is a plain skip rather
 * than a retry-worthy failure. Only a genuine fetch/API error propagates,
 * which is what lets a transient Graph API hiccup actually retry instead
 * of silently giving up on that lead's username forever.
 */
export function startUsernameResolutionWorker(boss: PgBoss, pool: Pool, keyring: Map<string, Buffer>): Promise<string> {
  return boss.work<ResolveUsernameJob>(USERNAME_RESOLUTION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { tenantId, leadId, leadEventId, instagramUserId } = job.data;

      // A comment (or an earlier resolution) may have supplied a username
      // for this lead already, between enqueue and now — skip the Graph
      // API call entirely rather than overwrite/duplicate work.
      if (await hasKnownUsername(pool, tenantId, leadId)) continue;

      const account = await getSoleConnectedAccount(pool, tenantId);
      if (!account) continue; // disconnected since the event was ingested

      const token = await getDecryptedToken(pool, keyring, tenantId, account.instagramAccountId);
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
        throw err; // let pg-boss's retry policy handle a transient failure
      }
    }
  });
}
