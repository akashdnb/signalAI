import type { PgBoss, Job } from "pg-boss";
import type { Pool, PoolClient } from "pg";
import { recalculateLeadIntelligence } from "../services/leadScoring.js";
import { listLeadIdsWithIntelligence } from "../db/leadIntelligence.js";
import { asPgBossDb } from "./leadEventsQueue.js";

export const TENANT_SCORING_REFRESH_QUEUE = "tenant-scoring-refresh";

// A window, not a fixed delay: several rule edits in quick succession
// (create, then immediately disable, say) must coalesce into ONE
// recalculation pass, not one per edit. pg-boss refuses a second send for
// the same singletonKey while a job for it is still pending/active within
// this window — see enqueueTenantScoringRefresh.
const REFRESH_DEBOUNCE_SECONDS = 15;

// Bounded paging, never an unbounded SELECT or a single Promise.all across
// every lead a large tenant has — see startTenantScoringRefreshWorker.
const REFRESH_BATCH_SIZE = 200;

export interface TenantScoringRefreshJob {
  tenantId: string;
}

export async function ensureTenantScoringRefreshQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(TENANT_SCORING_REFRESH_QUEUE, { retryLimit: 3, retryBackoff: true });
}

/**
 * Objective B: a scoring-rule create/update/delete must eventually be
 * reflected in every lead's existing intelligence, without ever running
 * that recalculation synchronously inside the HTTP request (a tenant could
 * have thousands of leads). Called from routes/leadScoringRules.ts after
 * every successful mutation.
 *
 * Coalescing: singletonKey = tenantId + singletonSeconds means repeated
 * sends for the same tenant within the debounce window are no-ops — only
 * one job is ever pending per tenant at a time. This is safe specifically
 * BECAUSE the worker re-reads the tenant's current rules from the database
 * when it actually runs (never from this job's payload) — whichever edit's
 * send "won" the dedupe doesn't matter, since the job that eventually runs
 * reflects every edit made before it started.
 *
 * `client`, when passed, makes the enqueue part of the CALLER's own
 * transaction (same pattern as leadEventsQueue.ts's enqueueLeadEvent) — the
 * scoring-rule mutation and this job row commit or roll back together, so
 * a queue-send failure can never leave a committed rule with no pending
 * refresh, and an enqueue that "succeeded" can never outlive a rolled-back
 * mutation.
 */
export async function enqueueTenantScoringRefresh(
  boss: PgBoss,
  tenantId: string,
  options?: { client?: PoolClient },
): Promise<void> {
  await boss.send(
    TENANT_SCORING_REFRESH_QUEUE,
    { tenantId },
    {
      singletonKey: tenantId,
      singletonSeconds: REFRESH_DEBOUNCE_SECONDS,
      ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
    },
  );
}

/**
 * Re-scores every lead this tenant already has an intelligence projection
 * for — the only leads a scoring-rule change could possibly affect (a lead
 * with no captured facts/milestones ever recorded has no intelligence row
 * to begin with; see db/leadIntelligence.ts). Pages through them in
 * bounded batches rather than one unbounded query or an unbounded
 * Promise.all, so a large tenant can't hold this worker (or a DB
 * connection) indefinitely.
 *
 * Idempotent: recalculateLeadIntelligence is deterministic per lead, and
 * upsertLeadIntelligence only inserts a new history row when the resulting
 * projection actually changed — so re-running this (a retry, or a second
 * debounced job landing moments apart) for a lead whose score didn't move
 * produces zero extra history rows, not just cheap extra work.
 */
export function startTenantScoringRefreshWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work<TenantScoringRefreshJob>(TENANT_SCORING_REFRESH_QUEUE, async (jobs: Job<TenantScoringRefreshJob>[]) => {
    for (const job of jobs) {
      const { tenantId } = job.data;
      let afterLeadId: string | null = null;

      for (;;) {
        const leadIds = await listLeadIdsWithIntelligence(pool, tenantId, { afterLeadId, limit: REFRESH_BATCH_SIZE });
        if (leadIds.length === 0) break;

        for (const leadId of leadIds) {
          await recalculateLeadIntelligence(pool, tenantId, leadId);
        }

        afterLeadId = leadIds[leadIds.length - 1]!;
        if (leadIds.length < REFRESH_BATCH_SIZE) break; // last page
      }
    }
  });
}
