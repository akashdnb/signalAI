import type { Queryable } from "./types.js";

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
  /** Meta's own comment id — required to post a public reply to this exact comment (replyChannel 'comment'/'both'). Null for older events ingested before this was captured. */
  commentId: string | null;
}

/** Everything the reply engine needs for one event, joined once rather than three separate round trips. */
export async function getEventForReply(
  pool: Queryable,
  tenantId: string,
  leadEventId: string,
): Promise<EventForReply | null> {
  const result = await pool.query<{
    lead_id: string;
    event_type: string;
    attributes: { matchedCampaignId?: string; matchedKeyword?: string; commentId?: string };
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
    commentId: row.attributes.commentId ?? null,
  };
}

export interface LeadEventForTimeline {
  id: string;
  eventType: string;
  occurredAt: Date;
  commentText: string | null;
  dmText: string | null;
  username: string | null;
  matchedKeyword: string | null;
}

/** Phase 2A Lead Timeline's Meta-webhook-sourced half — see db/leadTimeline.ts for how this merges with lead_activity's CRM-sourced half. */
export async function listEventsForLead(pool: Queryable, tenantId: string, leadId: string): Promise<LeadEventForTimeline[]> {
  const result = await pool.query<{
    id: string;
    event_type: string;
    occurred_at: Date;
    attributes: { matchedKeyword?: string };
    comment_text: string | null;
    dm_text: string | null;
    username: string | null;
  }>(
    `select e.id, e.event_type, e.occurred_at, e.attributes, p.comment_text, p.dm_text, p.username
     from lead_events e
     left join lead_pii p on p.lead_event_id = e.id and p.deleted_at is null
     where e.tenant_id = $1 and e.lead_id = $2
     order by e.occurred_at`,
    [tenantId, leadId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    commentText: row.comment_text,
    dmText: row.dm_text,
    username: row.username,
    matchedKeyword: row.attributes.matchedKeyword ?? null,
  }));
}

export interface LeadEventForHistory {
  occurredAt: Date;
  commentText: string | null;
  dmText: string | null;
}

/**
 * Bounded companion to listEventsForLead, for building LLM conversation
 * history rather than the full dashboard timeline: caps rows fetched to the
 * `limit` most-recent, so the query stays cheap regardless of how long the
 * lead's total history is. Excludes `excludeEventId` — the event currently
 * being replied to, whose text is already the LLM's userMessage, not history.
 *
 * `eventType`, when given, restricts to that event type (`"comment"` or
 * `"message"`) at the SQL level — the Comment Reply vs DM Reply privacy
 * boundary (conversationHistory.ts): a public comment reply's history must
 * never even be fetched from a private DM event, not just filtered out
 * afterward. Omitted (the default) preserves the original mixed-channel
 * query, unchanged, for the DM tier's existing behavior.
 */
export async function listRecentEventsForLead(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  excludeEventId: string,
  eventType?: string,
): Promise<LeadEventForHistory[]> {
  const result = await pool.query<{ occurred_at: Date; comment_text: string | null; dm_text: string | null }>(
    eventType
      ? `select e.occurred_at, p.comment_text, p.dm_text
         from lead_events e
         left join lead_pii p on p.lead_event_id = e.id and p.deleted_at is null
         where e.tenant_id = $1 and e.lead_id = $2 and e.id != $3 and e.event_type = $5
         order by e.occurred_at desc
         limit $4`
      : `select e.occurred_at, p.comment_text, p.dm_text
         from lead_events e
         left join lead_pii p on p.lead_event_id = e.id and p.deleted_at is null
         where e.tenant_id = $1 and e.lead_id = $2 and e.id != $3
         order by e.occurred_at desc
         limit $4`,
    eventType ? [tenantId, leadId, excludeEventId, limit, eventType] : [tenantId, leadId, excludeEventId, limit],
  );
  return result.rows.map((row) => ({
    occurredAt: row.occurred_at,
    commentText: row.comment_text,
    dmText: row.dm_text,
  }));
}

/**
 * Bounded, cursor-paginated companion to listEventsForLead — for the Lead
 * Timeline UI (leadTimeline.ts's getLeadTimelinePage), which previously
 * fetched a lead's entire history on every load/reload, unbounded, and was
 * slow for a long-running conversation. `before` (exclusive) pages
 * backwards from the most recent event; omitted, starts from the newest.
 * Capped to `limit + 1` — see getLeadTimelinePage for why one extra row is
 * fetched per source (it's what lets `hasMore` be computed correctly after
 * merging three differently-sourced result sets).
 */
export async function listEventsForLeadPage(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  before?: Date,
): Promise<LeadEventForTimeline[]> {
  const result = await pool.query<{
    id: string;
    event_type: string;
    occurred_at: Date;
    attributes: { matchedKeyword?: string };
    comment_text: string | null;
    dm_text: string | null;
    username: string | null;
  }>(
    `select e.id, e.event_type, e.occurred_at, e.attributes, p.comment_text, p.dm_text, p.username
     from lead_events e
     left join lead_pii p on p.lead_event_id = e.id and p.deleted_at is null
     where e.tenant_id = $1 and e.lead_id = $2 and ($4::timestamptz is null or e.occurred_at < $4)
     order by e.occurred_at desc
     limit $3`,
    [tenantId, leadId, limit, before ?? null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    commentText: row.comment_text,
    dmText: row.dm_text,
    username: row.username,
    matchedKeyword: row.attributes.matchedKeyword ?? null,
  }));
}

export async function insertEventIdempotent(
  pool: Queryable,
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
