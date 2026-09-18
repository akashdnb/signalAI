import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { findOrCreateLeadByInstagramUserId, nextSequence, updateMessagingWindow } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
import type { ParsedWebhookEvent } from "../lib/instagramWebhookParser.js";

const MESSAGING_WINDOW_HOURS = 24;

/**
 * B3's entire job, per the roadmap: persist the raw event and ack quickly.
 * No LLM calls, no sends — that's the worker (B4+) picking up the enqueued
 * job. This function does the minimum DB work needed to make that handoff
 * safe: resolve identity, dedupe, record content, open the messaging
 * window, enqueue.
 */
export async function ingestWebhookEvent(
  pool: Pool,
  boss: PgBoss,
  event: ParsedWebhookEvent,
): Promise<void> {
  const tenantId = await findTenantByInstagramAccountId(pool, event.instagramAccountId);
  if (!tenantId) {
    // Not one of ours (or not yet connected) — nothing to attach this to.
    return;
  }

  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, event.instagramUserId);
  const sequence = await nextSequence(pool, tenantId, lead.id);

  const inserted = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: event.metaEventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    sequence,
  });

  if (!inserted) {
    // Duplicate delivery of an event already fully processed — a no-op,
    // not an error. The sequence number issued above is simply unused.
    return;
  }

  await insertPii(pool, {
    leadEventId: inserted.id,
    leadId: lead.id,
    commentText: event.commentText,
    dmText: event.dmText,
    username: event.username,
  });

  const windowOpenUntil = new Date(event.occurredAt.getTime() + MESSAGING_WINDOW_HOURS * 60 * 60 * 1000);
  await updateMessagingWindow(pool, tenantId, lead.id, event.occurredAt, windowOpenUntil);

  await enqueueLeadEvent(boss, {
    tenantId,
    leadId: lead.id,
    leadEventId: inserted.id,
    sequence,
  });
}
