import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { findOrCreateLeadByInstagramUserId, nextSequence, setActiveDmCampaignId, updateLastInboundAt, updateMessagingWindow } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { listActiveCampaignKeywordsForInstagramAccount, type ReplyChannel, type TriggerSource } from "../db/campaigns.js";
import { findMatchingCampaign, resolveDmCampaignTrigger } from "../lib/keywordMatch.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
import { enqueueNewLeadAlert } from "../queue/alertsQueue.js";
import { enqueueUsernameResolution } from "../queue/usernameResolutionQueue.js";
import { recordSentReply, sentReplyExistsForMetaMessageId } from "../db/sentReplies.js";
import type { ParsedWebhookEvent } from "../lib/instagramWebhookParser.js";

const MESSAGING_WINDOW_HOURS = 24;

/**
 * Ingests every event from one webhook payload. Meta can batch up to
 * ~1000 updates into a single POST, so tenant resolution and the active-
 * tenant identity is resolved once per distinct account across the batch.
 * Campaigns are separately cached per connected Instagram account: workspace-
 * level reusable journeys only run when that account is explicitly attached.
 */
export async function ingestWebhookEvents(
  pool: Pool,
  boss: PgBoss,
  events: ParsedWebhookEvent[],
): Promise<void> {
  const tenantIdByAccount = new Map<string, string | null>();
  const campaignsByAccount = new Map<
    string,
    Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource; replyChannel: ReplyChannel }>
  >();

  for (const event of events) {
    let tenantId = tenantIdByAccount.get(event.instagramAccountId);
    if (tenantId === undefined) {
      tenantId = await findTenantByInstagramAccountId(pool, event.instagramAccountId);
      tenantIdByAccount.set(event.instagramAccountId, tenantId);
    }
    if (!tenantId) {
      // Was silent before — indistinguishable in logs from "no event sent
      // at all", which made a subscribed-but-unresolvable account (or an
      // account connected to a different system) invisible to diagnose.
      // eslint-disable-next-line no-console
      console.warn(`Instagram webhook for unrecognized account ${event.instagramAccountId} — dropping (not connected to any tenant)`);
      continue;
    }

    let campaigns = campaignsByAccount.get(event.instagramAccountId);
    if (!campaigns) {
      campaigns = await listActiveCampaignKeywordsForInstagramAccount(pool, tenantId, event.instagramAccountId);
      campaignsByAccount.set(event.instagramAccountId, campaigns);
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

  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, event.instagramUserId, event.instagramAccountId);
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
  campaigns: Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource; replyChannel: ReplyChannel }>,
  event: ParsedWebhookEvent,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lead = await findOrCreateLeadByInstagramUserId(client, tenantId, event.instagramUserId, event.instagramAccountId);
    const sequence = await nextSequence(client, tenantId, lead.id);

    // Compare this DM with the prior genuine inbound DM, not the leads-table
    // projection: older builds also refreshed that projection on comments.
    // Only a previous customer DM keeps an existing automation in-window.
    const previousDmResult = event.eventType === "message"
      ? await client.query<{ occurred_at: Date }>(
          `select occurred_at from lead_events
           where tenant_id = $1 and lead_id = $2 and event_type = 'message'
           order by occurred_at desc, id desc limit 1`,
          [tenantId, lead.id],
        )
      : null;
    const previousInboundDmAt = previousDmResult?.rows[0]?.occurred_at ?? null;
    const previousWindowOpen = !!previousInboundDmAt &&
      previousInboundDmAt.getTime() <= event.occurredAt.getTime() &&
      event.occurredAt.getTime() - previousInboundDmAt.getTime() <= MESSAGING_WINDOW_HOURS * 60 * 60 * 1000;

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
    let attributes: Record<string, unknown> = { instagramAccountId: event.instagramAccountId };
    if (event.eventType === "comment" && event.mediaId) attributes.mediaId = event.mediaId;
    if (event.eventType === "comment" && event.commentId) attributes.commentId = event.commentId;

    const sourceText = event.eventType === "comment" ? event.commentText : event.dmText;
    if (sourceText) {
      if (event.eventType === "message") {
        const match = resolveDmCampaignTrigger(sourceText, campaigns, lead.activeDmCampaignId, previousWindowOpen, event.mediaId, !!previousInboundDmAt);
        if (match) {
          attributes.matchedCampaignId = match.campaignId;
          attributes.matchedKeyword = match.keyword;
          if (match.restartCampaign) attributes.restartCampaign = true;
          await setActiveDmCampaignId(client, tenantId, lead.id, match.campaignId);
        }
      } else {
        const eligible = campaigns.filter((c) => c.triggerSource === "comment" || c.triggerSource === "both");
        const match = findMatchingCampaign(sourceText, event.mediaId, eligible);
        if (match) {
          attributes.matchedCampaignId = match.campaignId;
          attributes.matchedKeyword = match.keyword;
          const matchedCampaign = campaigns.find((campaign) => campaign.id === match.campaignId);
          const commentAgeMs = Date.now() - event.occurredAt.getTime();
          // Remember a comment-started campaign only when it can send a
          // private DM reply for this comment. That lets the customer's later
          // DM continue this run, but only an actual inbound DM opens the
          // standard 24-hour window.
          if (
            matchedCampaign && event.commentId &&
            (matchedCampaign.replyChannel === "dm" || matchedCampaign.replyChannel === "both") &&
            commentAgeMs >= 0 && commentAgeMs < 7 * 24 * 60 * 60 * 1000
          ) {
            await setActiveDmCampaignId(client, tenantId, lead.id, match.campaignId);
          }
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
        { tenantId, leadId: lead.id, leadEventId: inserted.id, instagramUserId: event.instagramUserId, instagramAccountId: event.instagramAccountId },
        { client },
      );
    }

    // Only a genuine inbound DM refreshes the standard 24-hour messaging
    // window. Comments and business echoes are not customer DM messages.
    if (event.eventType === "message") {
      const windowOpenUntil = new Date(event.occurredAt.getTime() + MESSAGING_WINDOW_HOURS * 60 * 60 * 1000);
      await updateMessagingWindow(client, tenantId, lead.id, event.occurredAt, windowOpenUntil);
    } else {
      // Keep comment conversations eligible for Inbox unread state, but don't
      // create or extend the 24-hour DM window from a public comment alone.
      await updateLastInboundAt(client, tenantId, lead.id, event.occurredAt);
    }

    await enqueueLeadEvent(
      boss,
      { tenantId, leadId: lead.id, leadEventId: inserted.id, sequence, instagramAccountId: event.instagramAccountId },
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
