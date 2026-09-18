import type { PgBoss, Job } from "pg-boss";
import type { Pool } from "pg";
import { advanceSequence, isSequenceStale } from "../db/leads.js";
import { LEAD_EVENTS_DLQ, LEAD_EVENTS_QUEUE, type LeadEventJob } from "./leadEventsQueue.js";

export type LeadEventHandler = (job: LeadEventJob) => Promise<void>;

/**
 * Applies the per-lead ordering frontier around the handoff to business
 * logic (roadmap: events older than last_applied_sequence are logged but
 * produce no state-mutating side effects). The frontier only advances
 * AFTER the handler succeeds — advancing it before would make a retry of a
 * genuine failure indistinguishable from a stale duplicate, silently
 * eating the retry instead of ever reaching the dead letter queue.
 *
 * batchSize/localConcurrency default well above pg-boss's own defaults
 * (batchSize: 1) on purpose: key_strict_fifo exposes at most one eligible
 * job per singletonKey at a time, so a fetched batch can never contain two
 * jobs for the same lead — every job in it is safe to run concurrently.
 * Signal's actual shape (a viral Reel: thousands of distinct leads, one
 * event apiece) is the shape this policy handles worst at batchSize 1 —
 * see scripts/loadTestLeadEventsQueue.ts.
 */
export function startLeadEventsWorker(
  boss: PgBoss,
  pool: Pool,
  handler: LeadEventHandler,
  options: { batchSize?: number; localConcurrency?: number } = {},
): Promise<string> {
  const { batchSize = 1, localConcurrency = 1 } = options;
  return boss.work<LeadEventJob>(
    LEAD_EVENTS_QUEUE,
    { batchSize, localConcurrency },
    async (jobs: Job<LeadEventJob>[]) => {
      await Promise.all(
        jobs.map(async (job) => {
          const { tenantId, leadId, sequence } = job.data;
          if (await isSequenceStale(pool, tenantId, leadId, sequence)) return;
          await handler(job.data);
          await advanceSequence(pool, tenantId, leadId, sequence);
        }),
      );
    },
  );
}

export type DeadLetterHandler = (job: LeadEventJob) => Promise<void>;

/**
 * A permanently-failed job under key_strict_fifo blocks its own lead
 * indefinitely, so this must exist before the queue is trusted with real
 * traffic — a wedged lead needs an operator alert, not silence.
 */
export function startDeadLetterWatcher(boss: PgBoss, onDeadLetter: DeadLetterHandler): Promise<string> {
  return boss.work<LeadEventJob>(LEAD_EVENTS_DLQ, async (jobs: Job<LeadEventJob>[]) => {
    for (const job of jobs) {
      await onDeadLetter(job.data);
    }
  });
}
