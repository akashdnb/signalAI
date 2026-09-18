import type { Pool } from "pg";

export interface Lead {
  id: string;
  tenantId: string;
  instagramUserId: string | null;
  activeMilestoneId: string | null;
  lastInboundAt: Date | null;
  windowOpenUntil: Date | null;
  lastAppliedSequence: number;
  createdAt: Date;
}

interface LeadRow {
  id: string;
  tenant_id: string;
  instagram_user_id: string | null;
  active_milestone_id: string | null;
  last_inbound_at: Date | null;
  window_open_until: Date | null;
  last_applied_sequence: string; // bigint comes back as string from pg
  created_at: Date;
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    instagramUserId: row.instagram_user_id,
    activeMilestoneId: row.active_milestone_id,
    lastInboundAt: row.last_inbound_at,
    windowOpenUntil: row.window_open_until,
    lastAppliedSequence: Number(row.last_applied_sequence),
    createdAt: row.created_at,
  };
}

/**
 * Identity spine entry point: resolves an inbound Instagram event to its
 * lead, minting one on first contact. Every caller must supply tenantId —
 * there is no variant of this lookup that can cross a tenant boundary.
 */
export async function findOrCreateLeadByInstagramUserId(
  pool: Pool,
  tenantId: string,
  instagramUserId: string,
): Promise<Lead> {
  const result = await pool.query<LeadRow>(
    `insert into leads (tenant_id, instagram_user_id)
     values ($1, $2)
     on conflict (tenant_id, instagram_user_id) where instagram_user_id is not null
     do update set tenant_id = excluded.tenant_id
     returning *`,
    [tenantId, instagramUserId],
  );
  return toLead(result.rows[0]!);
}

export async function getLead(pool: Pool, tenantId: string, leadId: string): Promise<Lead | null> {
  const result = await pool.query<LeadRow>(
    `select * from leads where id = $1 and tenant_id = $2`,
    [leadId, tenantId],
  );
  return result.rows[0] ? toLead(result.rows[0]) : null;
}

export async function updateMessagingWindow(
  pool: Pool,
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
 * Advances the per-lead ordering frontier (roadmap: pg-boss key_strict_fifo,
 * singletonKey = lead_id). Returns false if `sequence` is not newer than what
 * is already applied — the caller's signal to skip state-mutating side
 * effects for a retry that arrived after a newer event already landed.
 */
export async function tryAdvanceSequence(
  pool: Pool,
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
