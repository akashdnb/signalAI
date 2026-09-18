import type { PgBoss, Db } from "pg-boss";
import type { PoolClient } from "pg";

export const LEAD_EVENTS_QUEUE = "lead-events";
export const LEAD_EVENTS_DLQ = "lead-events-dlq";

export interface LeadEventJob {
  tenantId: string;
  leadId: string;
  leadEventId: string;
  sequence: number;
}

/**
 * key_strict_fifo, singletonKey = lead_id (roadmap Phase 1 Platform
 * Foundations): FIFO per lead, cross-lead parallelism, no extra
 * infrastructure. A failed job blocks its own key indefinitely under this
 * policy — that's exactly what the DLQ + worker below exists to catch.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(LEAD_EVENTS_DLQ);
  await boss.createQueue(LEAD_EVENTS_QUEUE, {
    policy: "key_strict_fifo",
    deadLetter: LEAD_EVENTS_DLQ,
    retryLimit: 3,
    retryBackoff: true,
  });
}

/** Wraps a checked-out transaction client as pg-boss's Db adapter, so send() runs the enqueue's INSERT on that same transaction. */
export function asPgBossDb(client: PoolClient): Db {
  return {
    async executeSql(text: string, values?: unknown[]) {
      const result = await client.query(text, values);
      return { rows: result.rows };
    },
  };
}

/**
 * `client`, when passed, makes the enqueue part of the caller's own
 * transaction (R1-01/R1-07 fix) — the job row and whatever else the
 * caller writes in that transaction commit or roll back together. Without
 * it, a crash between "event persisted" and "job enqueued" permanently
 * orphans the event: Meta's retry hits the idempotency key, the insert is
 * a no-op, and the job is never (re-)created.
 */
export async function enqueueLeadEvent(
  boss: PgBoss,
  job: LeadEventJob,
  options?: { client?: PoolClient; delaySeconds?: number },
): Promise<void> {
  await boss.send(LEAD_EVENTS_QUEUE, job, {
    singletonKey: job.leadId,
    ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
    ...(options?.delaySeconds ? { startAfter: options.delaySeconds } : {}),
  });
}
