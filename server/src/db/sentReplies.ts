import type { Queryable } from "./types.js";

export type SentReplyChannel = "dm" | "comment";
export type SentReplyEngine = "rule_based" | "ai_generated" | "human";

export interface SentReply {
  id: string;
  tenantId: string;
  leadId: string;
  leadEventId: string | null;
  channel: SentReplyChannel;
  engine: SentReplyEngine;
  text: string;
  sentAt: Date;
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
    `select * from sent_replies where tenant_id = $1 and lead_id = $2 order by sent_at asc, id asc`,
    [tenantId, leadId],
  );
  return result.rows.map(toSentReply);
}

export async function listSentRepliesForLeadPage(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  cursor?: { occurredAt: Date; sourceRank: number; id: string },
  sourceRank = 2,
): Promise<SentReply[]> {
  const result = await pool.query<SentReplyRow>(
    `select * from sent_replies
     where tenant_id = $1 and lead_id = $2
       and ($4::timestamptz is null or (sent_at, $5::int, id) < ($4::timestamptz, $5::int, $6::text))
     order by sent_at desc, id desc
     limit $3`,
    [tenantId, leadId, limit, cursor?.occurredAt ?? null, sourceRank, cursor?.id ?? ""],
  );
  return result.rows.map(toSentReply);
}

export interface SentReplyForHistory {
  text: string;
  sentAt: Date;
}

export async function listRecentSentRepliesForLead(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  channel?: SentReplyChannel,
): Promise<SentReplyForHistory[]> {
  const result = await pool.query<{ text: string; sent_at: Date }>(
    channel
      ? `select text, sent_at from sent_replies where tenant_id = $1 and lead_id = $2 and channel = $4 order by sent_at desc limit $3`
      : `select text, sent_at from sent_replies where tenant_id = $1 and lead_id = $2 order by sent_at desc limit $3`,
    channel ? [tenantId, leadId, limit, channel] : [tenantId, leadId, limit],
  );
  return result.rows.map((row) => ({ text: row.text, sentAt: row.sent_at }));
}

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
