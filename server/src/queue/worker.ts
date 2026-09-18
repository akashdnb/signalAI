import type { PgBoss, Job, JobWithMetadata } from "pg-boss";
import type { Pool } from "pg";
import { advanceSequence, isSequenceStale } from "../db/leads.js";
import { recordDeadLetterEvent } from "../db/deadLetterEvents.js";
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
 *
 * Verified empirically (not assumed): dead-lettering does NOT by itself
 * unblock the singletonKey. The source job is left behind in the source
 * queue's table with state='failed', and key_strict_fifo treats a job in
 * that state as still occupying the key forever — a second job for the
 * same lead sits at state='created' and is never fetched. `includeMetadata`
 * exposes `sourceName`/`sourceId` (the original queue and job id) on the
 * DLQ job specifically so this handler can delete that source row, which
 * is what actually frees the key for the next job.
 *
 * R3-08 fix: deleting the source row was also deleting the only record of
 * what failed. `dead_letter_events` is written FIRST, before the delete —
 * a permanently-failed event now leaves a queryable row, not just a log
 * line, even after the source job it came from is gone.
 */
export function startDeadLetterWatcher(
  boss: PgBoss,
  pool: Pool,
  onDeadLetter: DeadLetterHandler,
): Promise<string> {
  return boss.work(
    LEAD_EVENTS_DLQ,
    { includeMetadata: true } as const,
    async (jobs: JobWithMetadata<LeadEventJob>[]) => {
      for (const job of jobs) {
        if (job.sourceName && job.sourceId) {
          await recordDeadLetterEvent(pool, {
            queueName: job.sourceName,
            sourceJobId: job.sourceId,
            jobData: job.data,
            failureOutput: job.output,
          });
          await boss.deleteJob(job.sourceName, job.sourceId);
        }
        await onDeadLetter(job.data);
      }
    },
  );
}

/**
 * R3-08 fix, second half: unblocking a wedged key depends on the DLQ
 * worker having been running when the source job failed. If it was down
 * (crash, redeploy mid-outage), pg-boss's own maintenance still moves the
 * job to the dead-letter queue on its own schedule, but nothing deletes
 * the source row until a DLQ worker is listening again — meaning a lead
 * can sit wedged for however long that gap lasts. Run once at boot: any
 * source-queue job already sitting at state='failed' whose dead-letter
 * counterpart already exists is safe to record-and-delete immediately,
 * rather than waiting for the next DLQ poll cycle to notice it.
 */
export async function sweepWedgedLeadEventJobs(boss: PgBoss, pool: Pool): Promise<number> {
  const failed = await pool.query<{ id: string; data: LeadEventJob; output: unknown }>(
    `select id, data, output from pgboss.job where name = $1 and state = 'failed'`,
    [LEAD_EVENTS_QUEUE],
  );

  let swept = 0;
  for (const row of failed.rows) {
    const dlqMatch = await pool.query(
      `select 1 from pgboss.job where name = $1 and source_id = $2 limit 1`,
      [LEAD_EVENTS_DLQ, row.id],
    );
    if (dlqMatch.rowCount === 0) continue; // maintenance hasn't dead-lettered it yet — leave it

    await recordDeadLetterEvent(pool, {
      queueName: LEAD_EVENTS_QUEUE,
      sourceJobId: row.id,
      jobData: row.data,
      failureOutput: row.output,
    });
    await boss.deleteJob(LEAD_EVENTS_QUEUE, row.id);
    swept++;
  }
  return swept;
}
