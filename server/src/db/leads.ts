import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export interface Lead {
  id: string;
  tenantId: string;
  customerId: string | null;
  instagramUserId: string | null;
  activeMilestoneId: string | null;
  lastInboundAt: Date | null;
  windowOpenUntil: Date | null;
  lastAppliedSequence: number;
  createdAt: Date;
  /** Only populated by findOrCreateLeadByInstagramUserId (B11: "new lead" Telegram alert) — absent from every other lookup. */
  isNew?: boolean;
}

interface LeadRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  instagram_user_id: string | null;
  active_milestone_id: string | null;
  last_inbound_at: Date | null;
  window_open_until: Date | null;
  last_applied_sequence: string; // bigint comes back as string from pg
  created_at: Date;
  is_new?: boolean;
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    instagramUserId: row.instagram_user_id,
    activeMilestoneId: row.active_milestone_id,
    lastInboundAt: row.last_inbound_at,
    windowOpenUntil: row.window_open_until,
    lastAppliedSequence: Number(row.last_applied_sequence),
    createdAt: row.created_at,
    ...(row.is_new !== undefined ? { isNew: row.is_new } : {}),
  };
}

/**
 * Identity spine entry point: resolves an inbound Instagram event to its
 * lead, minting one on first contact. Every caller must supply tenantId —
 * there is no variant of this lookup that can cross a tenant boundary.
 *
 * `is_new` (via the classic `xmax = 0` upsert trick — true only when this
 * statement's own INSERT branch fired, false when it hit the ON CONFLICT
 * UPDATE branch instead) is what B11's "new lead" Telegram alert keys off,
 * in webhookIngestService.ts.
 */
export async function findOrCreateLeadByInstagramUserId(
  pool: Queryable,
  tenantId: string,
  instagramUserId: string,
): Promise<Lead> {
  const result = await pool.query<LeadRow>(
    `insert into leads (tenant_id, instagram_user_id)
     values ($1, $2)
     on conflict (tenant_id, instagram_user_id) where instagram_user_id is not null
     do update set tenant_id = excluded.tenant_id
     returning *, (xmax = 0) as is_new`,
    [tenantId, instagramUserId],
  );
  const row = result.rows[0]!;

  if (row.is_new) {
    // Customer/Lead split (roadmap Phase 1 Platform Foundations): mint one
    // customer per genuinely new lead, gated on is_new (xmax = 0) rather
    // than folded into the upsert above — a CTE there would run on every
    // call regardless of which branch fires, minting an orphan customer
    // row on every repeat comment from an already-known lead. This runs
    // once per lead. The caller (ingestOneEvent) wraps this whole call in
    // a transaction, so these two extra statements commit or roll back
    // with the lead insert atomically — see the migration's column comment
    // for why customer_id isn't NOT NULL.
    const customer = await pool.query<{ id: string }>(`insert into customers default values returning id`);
    row.customer_id = customer.rows[0]!.id;
    await pool.query(`update leads set customer_id = $2 where id = $1`, [row.id, row.customer_id]);
  }

  return toLead(row);
}

export async function getLead(pool: Queryable, tenantId: string, leadId: string): Promise<Lead | null> {
  const result = await pool.query<LeadRow>(
    `select * from leads where id = $1 and tenant_id = $2`,
    [leadId, tenantId],
  );
  return result.rows[0] ? toLead(result.rows[0]) : null;
}

export async function setActiveMilestone(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  milestoneId: string,
): Promise<void> {
  await pool.query(`update leads set active_milestone_id = $3 where id = $1 and tenant_id = $2`, [
    leadId,
    tenantId,
    milestoneId,
  ]);
}

export async function updateMessagingWindow(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  lastInboundAt: Date,
  windowOpenUntil: Date,
): Promise<void> {
  await pool.query(
    `update leads set last_inbound_at = $3, window_open_until = $4
     where id = $1 and tenant_id = $2`,
    [leadId, tenantId, lastInboundAt, windowOpenUntil],
  );
}

/**
 * Atomically issues the next sequence number for a lead at ingestion time
 * (distinct from last_applied_sequence, which tracks how far the worker
 * has gotten). Concurrent webhook deliveries for the same lead each get a
 * unique, strictly increasing number, never a collision.
 */
export async function nextSequence(pool: Queryable, tenantId: string, leadId: string): Promise<number> {
  const result = await pool.query<{ next_sequence: string }>(
    `update leads set next_sequence = next_sequence + 1
     where id = $1 and tenant_id = $2
     returning next_sequence`,
    [leadId, tenantId],
  );
  if (!result.rows[0]) {
    throw new Error(`Lead ${leadId} not found for tenant ${tenantId}`);
  }
  return Number(result.rows[0].next_sequence);
}

/**
 * Read-only check against the per-lead ordering frontier — call BEFORE
 * running the handler. True means a newer (or equal) event already applied,
 * so this one is superseded and the handler should be skipped.
 *
 * Deliberately not combined with advanceSequence into one "check and
 * commit" step: this needs to stay a peek, because committing the advance
 * before the handler runs would make a *retry of a genuine failure* look
 * indistinguishable from a stale duplicate — the retry's own sequence would
 * already equal the frontier, and it would silently no-op forever instead
 * of ever reaching the dead letter queue.
 */
export async function isSequenceStale(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  sequence: number,
): Promise<boolean> {
  const result = await pool.query<{ last_applied_sequence: string }>(
    `select last_applied_sequence from leads where id = $1 and tenant_id = $2`,
    [leadId, tenantId],
  );
  const current = result.rows[0] ? Number(result.rows[0].last_applied_sequence) : 0;
  return current >= sequence;
}

/**
 * Commits the ordering frontier forward — call AFTER the handler succeeds,
 * never before. Returns false if something else already advanced past this
 * sequence in between (defense in depth; key_strict_fifo should prevent two
 * workers ever processing the same lead concurrently in the first place).
 */
export interface LeadListItem {
  id: string;
  instagramUserId: string | null;
  username: string | null;
  /** The most recent lead_event's type for this lead ('comment' | 'message') — lets the dashboard show whether the last contact was a public comment or a DM. Null only for a lead with no events at all, which shouldn't happen outside a test. */
  lastEventType: string | null;
  activeMilestoneId: string | null;
  lastInboundAt: Date | null;
  windowOpenUntil: Date | null;
  createdAt: Date;
}

/**
 * BUI: the "lead list from B2" on the pilot dashboard. `username` is a
 * lateral pull of that lead's most recent non-deleted `lead_pii` row —
 * the creator's own dashboard is one of the few places this is
 * appropriate to surface at all, and only the latest handle, not history.
 * `lastEventType` is the same lateral-join shape, pulled from lead_events
 * instead — distinguishing a comment-triggered lead from a DM-only one is
 * otherwise invisible in this list.
 */
export async function listLeadsForTenant(pool: Pool, tenantId: string, limit = 100): Promise<LeadListItem[]> {
  const result = await pool.query<{
    id: string;
    instagram_user_id: string | null;
    username: string | null;
    last_event_type: string | null;
    active_milestone_id: string | null;
    last_inbound_at: Date | null;
    window_open_until: Date | null;
    created_at: Date;
  }>(
    `select l.id, l.instagram_user_id, l.active_milestone_id, l.last_inbound_at, l.window_open_until, l.created_at,
            p.username, e.event_type as last_event_type
     from leads l
     left join lateral (
       select username from lead_pii
       where lead_id = l.id and deleted_at is null and username is not null
       order by created_at desc limit 1
     ) p on true
     left join lateral (
       select event_type from lead_events
       where lead_id = l.id
       order by occurred_at desc limit 1
     ) e on true
     where l.tenant_id = $1
     order by coalesce(l.last_inbound_at, l.created_at) desc
     limit $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    instagramUserId: row.instagram_user_id,
    username: row.username,
    lastEventType: row.last_event_type,
    activeMilestoneId: row.active_milestone_id,
    lastInboundAt: row.last_inbound_at,
    windowOpenUntil: row.window_open_until,
    createdAt: row.created_at,
  }));
}

export async function advanceSequence(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  sequence: number,
): Promise<boolean> {
  const result = await pool.query(
    `update leads set last_applied_sequence = $3
     where id = $1 and tenant_id = $2 and last_applied_sequence < $3`,
    [leadId, tenantId, sequence],
  );
  return result.rowCount === 1;
}
