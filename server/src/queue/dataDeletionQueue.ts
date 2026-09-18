import type { PgBoss, Job } from "pg-boss";
import type { Pool } from "pg";
import { findLeadsByInstagramUserIdAcrossTenants, hardScrubLead } from "../db/pii.js";
import { markDeletionComplete } from "../db/deletionRequests.js";

export const DATA_DELETION_QUEUE = "data-deletion";

export interface DataDeletionJob {
  confirmationCode: string;
  metaUserId: string;
}

export async function ensureDataDeletionQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(DATA_DELETION_QUEUE, { retryLimit: 3, retryBackoff: true });
}

export async function enqueueDataDeletion(boss: PgBoss, job: DataDeletionJob): Promise<void> {
  await boss.send(DATA_DELETION_QUEUE, job);
}

/**
 * R1-09 fix: the scrub used to run synchronously inside the callback
 * request and mark 'complete' before responding — Meta's contract is a
 * fast ack plus a status URL precisely so this can be async. Runs here
 * instead; the route only ever returns 'pending'.
 */
export function startDataDeletionWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work(DATA_DELETION_QUEUE, async (jobs: Job<DataDeletionJob>[]) => {
    for (const job of jobs) {
      const matches = await findLeadsByInstagramUserIdAcrossTenants(pool, job.data.metaUserId);
      for (const match of matches) {
        await hardScrubLead(pool, match.tenantId, match.leadId);
      }
      await markDeletionComplete(pool, job.data.confirmationCode);
    }
  });
}
