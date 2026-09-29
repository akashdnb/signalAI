import type { Queryable } from "./types.js";

export type SentReplyChannel = "dm" | "comment";
/** 'human': a reply sent by an agent directly in Instagram, not through this system — see webhookIngestService.ts's echo-ingestion handling. */
export type SentReplyEngine = "rule_based" | "ai_generated" | "human";

export interface SentReply {
  id: string;
  tenantId: string;
  leadId: string;
  /** Null for a 'human' reply recorded from an echo — it isn't a reply to any one triggering lead_event in our own pipeline. Always set for 'rule_based'/'ai_generated'. */
  leadEventId: string | null;
  channel: SentReplyChannel;
  engine: SentReplyEngine;
  text: string;
  sentAt: Date;
  /** Meta's own message id for a 'dm' send — the correlation key echo-ingestion uses to tell "this echo is just confirming our own send" from "a human sent this directly." Null for a comment reply and for any row recorded before this existed. */
  metaMessageId: string | null;
}

interface SentReplyRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  lead_event_id: string | null;
  channel: SentReplyChannel;
  engine: SentReplyEngine;
  text: string;
  sent_at: Date;
  meta_message_id: string | null;
}

function toSentReply(row: SentReplyRow): SentReply {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    leadEventId: row.lead_event_id,
    channel: row.channel,
    engine: row.engine,
    text: row.text,
    sentAt: row.sent_at,
    metaMessageId: row.meta_message_id,
  };
}

/**
 * One row per actual channel send — a 'both'-channel campaign calls this
 * twice for one triggering lead_event (see leadEventReplyHandler.ts),
 * matching the two real Instagram API calls actually made, not once per
 * inbound event. Nothing else in this codebase previously persisted what
 * the bot sent back — sendInstagramMessage/sendInstagramCommentReply call
 * Meta's API directly, so the dashboard timeline showed only half of every
 * conversation.
 */
export async function recordSentReply(
  pool: Queryable,
  params: {
    tenantId: string;
    leadId: string;
    leadEventId: string | null;
    channel: SentReplyChannel;
    engine: SentReplyEngine;
    text: string;
    metaMessageId?: string | null;
    /** Defaults to now() — pass Meta's own timestamp when recording a human reply from an echo, so it sorts correctly against other messages instead of by ingestion time. */
    sentAt?: Date;
  },
): Promise<void> {
  await pool.query(
    `insert into sent_replies (tenant_id, lead_id, lead_event_id, channel, engine, text, meta_message_id, sent_at)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now()))`,
    [
      params.tenantId,
      params.leadId,
      params.leadEventId,
      params.channel,
      params.engine,
      params.text,
      params.metaMessageId ?? null,
      params.sentAt ?? null,
    ],
  );
}

export async function listSentRepliesForLead(pool: Queryable, tenantId: string, leadId: string): Promise<SentReply[]> {
  const result = await pool.query<SentReplyRow>(
    `select * from sent_replies where tenant_id = $1 and lead_id = $2 order by sent_at asc`,
    [tenantId, leadId],
  );
  return result.rows.map(toSentReply);
}

/** Bounded, cursor-paginated companion to listSentRepliesForLead — see listEventsForLeadPage in db/events.ts for the pagination contract this and leadTimeline.ts's getLeadTimelinePage share. */
export async function listSentRepliesForLeadPage(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  before?: Date,
): Promise<SentReply[]> {
  const result = await pool.query<SentReplyRow>(
    `select * from sent_replies
     where tenant_id = $1 and lead_id = $2 and ($4::timestamptz is null or sent_at < $4)
     order by sent_at desc
     limit $3`,
    [tenantId, leadId, limit, before ?? null],
  );
  return result.rows.map(toSentReply);
}

export interface SentReplyForHistory {
  text: string;
  sentAt: Date;
}

/** Bounded companion to listSentRepliesForLead, for LLM conversation history — see listRecentEventsForLead in db/events.ts for why this is capped rather than fetching the whole lead history. */
export async function listRecentSentRepliesForLead(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
): Promise<SentReplyForHistory[]> {
  const result = await pool.query<{ text: string; sent_at: Date }>(
    `select text, sent_at from sent_replies where tenant_id = $1 and lead_id = $2 order by sent_at desc limit $3`,
    [tenantId, leadId, limit],
  );
  return result.rows.map((row) => ({ text: row.text, sentAt: row.sent_at }));
}

/**
 * The correlation check echo-ingestion runs before recording anything: a
 * match means Meta is just echoing back a send this system already made
 * (bot or a future dashboard-originated human send) — see
 * webhookIngestService.ts. Scoped to tenant only (not lead) since that's
 * all echo-ingestion knows for certain before resolving the lead itself.
 */
export async function sentReplyExistsForMetaMessageId(
  pool: Queryable,
  tenantId: string,
  metaMessageId: string,
): Promise<boolean> {
  const result = await pool.query(`select 1 from sent_replies where tenant_id = $1 and meta_message_id = $2 limit 1`, [
    tenantId,
    metaMessageId,
  ]);
  return result.rows.length > 0;
}
