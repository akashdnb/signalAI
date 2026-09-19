import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { findOrCreateLeadByInstagramUserId, nextSequence, updateMessagingWindow } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { listActiveCampaignKeywords } from "../db/campaigns.js";
import { findMatchingCampaign } from "../lib/keywordMatch.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
import { enqueueNewLeadAlert } from "../queue/alertsQueue.js";
import type { ParsedWebhookEvent } from "../lib/instagramWebhookParser.js";

const MESSAGING_WINDOW_HOURS = 24;

/**
 * Ingests every event from one webhook payload. Meta can batch up to
 * ~1000 updates into a single POST, so tenant resolution and the active-
 * campaign list are each looked up once per distinct account/tenant
 * across the whole batch (R1-07 fix), not once per event — an N+1 that
 * mattered as soon as more than one event shared an account.
 */
export async function ingestWebhookEvents(
  pool: Pool,
  boss: PgBoss,
  events: ParsedWebhookEvent[],
): Promise<void> {
  const tenantIdByAccount = new Map<string, string | null>();
  const campaignsByTenant = new Map<string, Array<{ id: string; keywords: string[] }>>();

  for (const event of events) {
    let tenantId = tenantIdByAccount.get(event.instagramAccountId);
    if (tenantId === undefined) {
      tenantId = await findTenantByInstagramAccountId(pool, event.instagramAccountId);
      tenantIdByAccount.set(event.instagramAccountId, tenantId);
    }
    if (!tenantId) continue; // not one of ours (or not yet connected)

    let campaigns = campaignsByTenant.get(tenantId);
    if (!campaigns) {
      campaigns = await listActiveCampaignKeywords(pool, tenantId);
      campaignsByTenant.set(tenantId, campaigns);
    }

    await ingestOneEvent(pool, boss, tenantId, campaigns, event);
  }
}

/**
 * B3's entire job, per the roadmap: persist the raw event and ack quickly.
 * No LLM calls, no sends — that's the worker (B4+) picking up the enqueued
 * job. Everything here — identity resolution, dedupe, content, messaging
 * window, and the queue enqueue — runs in ONE transaction (R1-01 fix): a
 * crash between "event persisted" and "job enqueued" used to permanently
 * orphan the event, since Meta's retry would hit the idempotency key,
 * no-op, and never re-enqueue. Committing the job insert on the same
 * client (via pg-boss's IDatabase adapter) closes that window entirely —
 * either everything lands, or nothing does and Meta's retry starts clean.
 */
async function ingestOneEvent(
  pool: Pool,
  boss: PgBoss,
  tenantId: string,
  campaigns: Array<{ id: string; keywords: string[] }>,
  event: ParsedWebhookEvent,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lead = await findOrCreateLeadByInstagramUserId(client, tenantId, event.instagramUserId);
    const sequence = await nextSequence(client, tenantId, lead.id);

    // Keyword matching (Phase 1 Automation Engine) runs here, not deferred
    // to the worker: cheap deterministic string comparison against
    // non-PII data already loaded for this tenant, so there's no reason
    // to pay a queue round-trip for it. Every comment is still recorded
    // (analytics needs the full count) — matching only decides whether
    // the worker treats this as a trigger.
    let attributes: Record<string, unknown> = {};
    if (event.eventType === "comment" && event.commentText) {
      const match = findMatchingCampaign(event.commentText, campaigns);
      if (match) {
        attributes = { matchedCampaignId: match.campaignId, matchedKeyword: match.keyword };
      }
    }

    const inserted = await insertEventIdempotent(client, {
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
      await client.query("COMMIT");
      return;
    }

    await insertPii(client, {
      tenantId,
      leadEventId: inserted.id,
      leadId: lead.id,
      commentText: event.commentText,
      dmText: event.dmText,
      username: event.username,
    });

    const windowOpenUntil = new Date(event.occurredAt.getTime() + MESSAGING_WINDOW_HOURS * 60 * 60 * 1000);
    await updateMessagingWindow(client, tenantId, lead.id, event.occurredAt, windowOpenUntil);

    await enqueueLeadEvent(
      boss,
      { tenantId, leadId: lead.id, leadEventId: inserted.id, sequence },
      { client },
    );

    // R9-01/R9-02 fix: enqueues a fast local job (no external Telegram
    // call, no PII — see alertsQueue.ts) on the SAME transaction as
    // everything else here, so it commits or rolls back atomically with
    // the lead/event/enqueue above rather than needing a separate
    // post-commit step.
    if (lead.isNew) {
      await enqueueNewLeadAlert(boss, { tenantId, leadId: lead.id }, { client });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
