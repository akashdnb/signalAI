import type { Queryable } from "./types.js";

export type SentReplyChannel = "dm" | "comment";
export type SentReplyEngine = "rule_based" | "ai_generated";

export interface SentReply {
  id: string;
  tenantId: string;
  leadId: string;
  leadEventId: string;
  channel: SentReplyChannel;
  engine: SentReplyEngine;
  text: string;
  sentAt: Date;
}

interface SentReplyRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  lead_event_id: string;
  channel: SentReplyChannel;
  engine: SentReplyEngine;
  text: string;
  sent_at: Date;
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
    leadEventId: string;
    channel: SentReplyChannel;
    engine: SentReplyEngine;
    text: string;
  },
): Promise<void> {
  await pool.query(
    `insert into sent_replies (tenant_id, lead_id, lead_event_id, channel, engine, text)
     values ($1, $2, $3, $4, $5, $6)`,
    [params.tenantId, params.leadId, params.leadEventId, params.channel, params.engine, params.text],
  );
}

export async function listSentRepliesForLead(pool: Queryable, tenantId: string, leadId: string): Promise<SentReply[]> {
  const result = await pool.query<SentReplyRow>(
    `select * from sent_replies where tenant_id = $1 and lead_id = $2 order by sent_at asc`,
    [tenantId, leadId],
  );
  return result.rows.map(toSentReply);
}
