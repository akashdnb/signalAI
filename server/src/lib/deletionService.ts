import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { createDeletionRequest, getDeletionStatus as getDeletionStatusFromDb } from "../db/deletionRequests.js";
import { enqueueDataDeletion } from "../queue/dataDeletionQueue.js";

export type { DeletionStatus } from "../db/deletionRequests.js";

/**
 * OPEN QUESTION, resolve before App Review submission: the callback's
 * user_id is the Instagram-scoped id of whoever authorized the app. For an
 * Instagram Login app that is the connected professional account (the
 * tenant/creator), not an end-user commenter — so in the common case this
 * scrubs the tenant's own leads, which is very likely correct, but the
 * product/legal question of "does a creator's own account-deletion request
 * also erase their leads' conversation history" has not been decided. The
 * worker (queue/dataDeletionQueue.ts) scrubs every lead matching the id,
 * across tenants, which is the safer (more deletes, not fewer) default
 * until that's settled.
 *
 * R1-08/R1-09 fix: status persists in Postgres (survives a restart, which
 * matters because the App Reviewer checking the status URL is exactly who
 * would hit an in-memory Map after a redeploy) and the actual scrub runs
 * in a worker, not synchronously inside this call — this returns 'pending'
 * immediately, matching Meta's fast-ack-plus-status-URL contract.
 */
export async function requestDeletion(
  pool: Pool,
  boss: PgBoss,
  metaUserId: string,
): Promise<{ confirmationCode: string }> {
  const confirmationCode = await createDeletionRequest(pool, metaUserId);
  await enqueueDataDeletion(boss, { confirmationCode, metaUserId });
  return { confirmationCode };
}

export async function getDeletionStatus(pool: Pool, confirmationCode: string) {
  return getDeletionStatusFromDb(pool, confirmationCode);
}
