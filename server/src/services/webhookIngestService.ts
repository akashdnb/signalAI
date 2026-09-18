import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { findOrCreateLeadByInstagramUserId, nextSequence, updateMessagingWindow } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { listActiveCampaignKeywords } from "../db/campaigns.js";
import { findMatchingCampaign } from "../lib/keywordMatch.js";
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

  // Keyword matching (Phase 1 Automation Engine) runs here, not deferred to
  // the worker: it's cheap deterministic string comparison against
  // non-PII data, so there's no reason to pay a queue round-trip for it.
  // Every comment is still recorded (for analytics: "Total Comments
  // Received" counts all of them) — matching only decides whether the
  // worker treats this as a trigger.
  let attributes: Record<string, unknown> = {};
  if (event.eventType === "comment" && event.commentText) {
    const campaigns = await listActiveCampaignKeywords(pool, tenantId);
    const match = findMatchingCampaign(event.commentText, campaigns);
    if (match) {
      attributes = { matchedCampaignId: match.campaignId, matchedKeyword: match.keyword };
    }
  }

  const inserted = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: event.metaEventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    sequence,
    attributes,
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
