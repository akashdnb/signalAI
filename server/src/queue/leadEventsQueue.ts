import type { PgBoss } from "pg-boss";

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

export async function enqueueLeadEvent(boss: PgBoss, job: LeadEventJob): Promise<void> {
  await boss.send(LEAD_EVENTS_QUEUE, job, { singletonKey: job.leadId });
}
