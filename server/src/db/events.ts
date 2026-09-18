import type { Pool } from "pg";

export interface LeadEvent {
  id: string;
  tenantId: string;
  leadId: string;
  metaEventId: string;
  eventType: string;
  occurredAt: Date;
  sequence: number;
  attributes: Record<string, unknown>;
  createdAt: Date;
}

interface LeadEventRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  meta_event_id: string;
  event_type: string;
  occurred_at: Date;
  sequence: string;
  attributes: Record<string, unknown>;
  created_at: Date;
}

function toEvent(row: LeadEventRow): LeadEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    metaEventId: row.meta_event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    sequence: Number(row.sequence),
    attributes: row.attributes,
    createdAt: row.created_at,
  };
}

/**
 * Persists a webhook event keyed by Meta's own event id. Returns null on a
 * duplicate delivery (the ON CONFLICT DO NOTHING path) rather than throwing —
 * a duplicate is an expected, normal outcome of at-least-once delivery, not
 * an error condition.
 */
export interface EventForReply {
  leadId: string;
  eventType: string;
  matchedCampaignId: string | null;
  matchedKeyword: string | null;
  commentText: string | null;
  dmText: string | null;
  username: string | null;
}

/** Everything the reply engine needs for one event, joined once rather than three separate round trips. */
export async function getEventForReply(
  pool: Pool,
  tenantId: string,
  leadEventId: string,
): Promise<EventForReply | null> {
  const result = await pool.query<{
    lead_id: string;
    event_type: string;
    attributes: { matchedCampaignId?: string; matchedKeyword?: string };
    comment_text: string | null;
    dm_text: string | null;
    username: string | null;
  }>(
    `select e.lead_id, e.event_type, e.attributes, p.comment_text, p.dm_text, p.username
     from lead_events e
     left join lead_pii p on p.lead_event_id = e.id
     where e.id = $1 and e.tenant_id = $2`,
    [leadEventId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    leadId: row.lead_id,
    eventType: row.event_type,
    matchedCampaignId: row.attributes.matchedCampaignId ?? null,
    matchedKeyword: row.attributes.matchedKeyword ?? null,
    commentText: row.comment_text,
    dmText: row.dm_text,
    username: row.username,
  };
}

export async function insertEventIdempotent(
  pool: Pool,
  params: {
    tenantId: string;
    leadId: string;
    metaEventId: string;
    eventType: string;
    occurredAt: Date;
    sequence: number;
    attributes?: Record<string, unknown>;
  },
): Promise<LeadEvent | null> {
  const result = await pool.query<LeadEventRow>(
    `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (meta_event_id) do nothing
     returning *`,
    [
      params.tenantId,
      params.leadId,
      params.metaEventId,
      params.eventType,
      params.occurredAt,
      params.sequence,
      JSON.stringify(params.attributes ?? {}),
    ],
  );
  return result.rows[0] ? toEvent(result.rows[0]) : null;
}
