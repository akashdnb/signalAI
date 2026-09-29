import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { findOrCreateLeadByInstagramUserId, nextSequence, setActiveDmCampaignId, updateMessagingWindow } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { listActiveCampaignKeywords, type TriggerSource } from "../db/campaigns.js";
import { findMatchingCampaign, CONTINUATION_KEYWORD } from "../lib/keywordMatch.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
import { enqueueNewLeadAlert } from "../queue/alertsQueue.js";
import { enqueueUsernameResolution } from "../queue/usernameResolutionQueue.js";
import { recordSentReply, sentReplyExistsForMetaMessageId } from "../db/sentReplies.js";
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
  const campaignsByTenant = new Map<
    string,
    Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource }>
  >();

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

    if (event.isEcho) {
      await ingestOneEchoEvent(pool, tenantId, event);
      continue;
    }

    await ingestOneEvent(pool, boss, tenantId, campaigns, event);
  }
}

/**
 * Conversation memory (human replies): an echo is Meta reporting a DM the
 * connected account itself sent — the bot, via leadEventReplyHandler.ts, OR
 * a human agent replying directly in Instagram, outside this system
 * entirely. There is no lead_event to run this through (it isn't an inbound
 * trigger candidate — no keyword matching, no messaging-window update, no
 * queue job), just a fact to record once, deduped against our own sends by
 * Meta's message id (see db/sentReplies.ts's sentReplyExistsForMetaMessageId):
 * a match means this is just Meta confirming a send this system already
 * recorded; a miss means it's new — a human's reply, recorded as engine
 * 'human' so it reaches the dashboard timeline and the LLM's conversation
 * history exactly like a bot reply does.
 */
async function ingestOneEchoEvent(pool: Pool, tenantId: string, event: ParsedWebhookEvent): Promise<void> {
  if (!event.metaMessageId || !event.dmText) return; // nothing to correlate or record

  const alreadyRecorded = await sentReplyExistsForMetaMessageId(pool, tenantId, event.metaMessageId);
  if (alreadyRecorded) return;

  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, event.instagramUserId);
  await recordSentReply(pool, {
    tenantId,
    leadId: lead.id,
    leadEventId: null,
    channel: "dm",
    engine: "human",
    text: event.dmText,
    metaMessageId: event.metaMessageId,
    sentAt: event.occurredAt,
  });
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
  campaigns: Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource }>,
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
    // to pay a queue round-trip for it. Every comment/message is still
    // recorded (analytics needs the full count) — matching only decides
    // whether the worker treats this as a trigger.
    //
    // A campaign's trigger_source ('comment' | 'message' | 'both') decides
    // which event types it's even a candidate for — distinct from
    // reply_channel, which decides where the reply goes once triggered.
    // `event.mediaId` is undefined for a message, which already makes
    // findMatchingCampaign skip any post-scoped campaign (see
    // keywordMatch.ts) — post-targeting simply doesn't apply to a DM,
    // and that falls out of the existing check for free.
    //
    // mediaId/commentId are recorded on EVERY comment event, matched or
    // not — this is what lets the campaign editor offer "posts we've seen
    // a comment on" as a picker (listKnownMediaForTenant) without a
    // separate Graph API media-listing call for THIS media, and commentId
    // is what the worker needs to post a public reply to this exact comment.
    let attributes: Record<string, unknown> = {};
    if (event.eventType === "comment" && event.mediaId) attributes.mediaId = event.mediaId;
    if (event.eventType === "comment" && event.commentId) attributes.commentId = event.commentId;

    const sourceText = event.eventType === "comment" ? event.commentText : event.dmText;
    if (sourceText) {
      const eligible = campaigns.filter((c) => c.triggerSource === event.eventType || c.triggerSource === "both");
      const match = findMatchingCampaign(sourceText, event.mediaId, eligible);
      if (match) {
        attributes.matchedCampaignId = match.campaignId;
        attributes.matchedKeyword = match.keyword;
        // DM Conversation Continuation: remember which campaign this lead's
        // DM conversation belongs to, so a later message that doesn't
        // independently match any keyword can still fall back to it (below,
        // and on this lead's NEXT event). Comments never set/read this —
        // a public comment thread isn't a private ongoing conversation the
        // same way.
        if (event.eventType === "message") {
          await setActiveDmCampaignId(client, tenantId, lead.id, match.campaignId);
        }
      } else if (event.eventType === "message" && lead.activeDmCampaignId) {
        // DM Conversation Continuation fallback: this message didn't match
        // any keyword on its own, but this lead already has an ongoing DM
        // conversation — checked against `lead`'s PRE-update windowOpenUntil
        // (the window's state as of the PRIOR interaction, before this
        // function's own updateMessagingWindow call below extends it using
        // THIS message's timestamp) so a customer who's gone quiet 24h+ and
        // messages again out of the blue needs to mention a keyword again,
        // same as Instagram's own DM policy window governs elsewhere here.
        const stillOpen = !!lead.windowOpenUntil && lead.windowOpenUntil.getTime() >= event.occurredAt.getTime();
        // `campaigns` already only contains tenant_id-scoped, enabled=true
        // campaigns (listActiveCampaignKeywords) — a since-disabled
        // campaign naturally isn't found here, no extra check needed.
        const continuedCampaign = campaigns.find((c) => c.id === lead.activeDmCampaignId);
        const dmEligible =
          continuedCampaign && (continuedCampaign.triggerSource === "message" || continuedCampaign.triggerSource === "both");
        if (stillOpen && dmEligible) {
          attributes.matchedCampaignId = lead.activeDmCampaignId;
          attributes.matchedKeyword = CONTINUATION_KEYWORD;
        }
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

    // Meta's Messaging webhook never carries a username (only the sender's
    // IGSID) — unlike Comments, whose `from` object does. Without this, a
    // lead whose first (or only) contact is a DM or a shared Reel shows up
    // as "(unknown)" forever. Deferred to a queued job rather than an
    // inline Graph API call: this function's whole job is to persist and
    // ack fast (see the docstring above), and the profile lookup needs the
    // account's token and an external round-trip. The worker itself
    // no-ops if a comment on the same lead already supplied a username by
    // the time it runs.
    if (!event.username) {
      await enqueueUsernameResolution(
        boss,
        { tenantId, leadId: lead.id, leadEventId: inserted.id, instagramUserId: event.instagramUserId },
        { client },
      );
    }

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
