import type { Queryable } from "./types.js";

export type LeadActivityType =
  | "note_added"
  | "pipeline_stage_changed"
  | "owner_assigned"
  | "handoff_changed"
  | "tag_added"
  | "tag_removed"
  | "deal_created"
  | "deal_stage_changed";

export interface LeadActivity {
  id: string;
  leadId: string;
  actorUserId: string | null;
  type: LeadActivityType;
  summary: string;
  createdAt: Date;
}

interface LeadActivityRow {
  id: string;
  lead_id: string;
  actor_user_id: string | null;
  type: LeadActivityType;
  summary: string;
  created_at: Date;
}

function toLeadActivity(row: LeadActivityRow): LeadActivity {
  return {
    id: row.id,
    leadId: row.lead_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

export async function recordLeadActivity(
  pool: Queryable,
  params: {
    tenantId: string;
    leadId: string;
    actorUserId?: string | null;
    type: LeadActivityType;
    summary: string;
  },
): Promise<LeadActivity> {
  const result = await pool.query<LeadActivityRow>(
    `insert into lead_activity (tenant_id, lead_id, actor_user_id, type, summary)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [params.tenantId, params.leadId, params.actorUserId ?? null, params.type, params.summary],
  );
  return toLeadActivity(result.rows[0]!);
}

export async function listLeadActivity(pool: Queryable, tenantId: string, leadId: string): Promise<LeadActivity[]> {
  const result = await pool.query<LeadActivityRow>(
    `select * from lead_activity where tenant_id = $1 and lead_id = $2 order by created_at, id`,
    [tenantId, leadId],
  );
  return result.rows.map(toLeadActivity);
}

export async function listLeadActivityPage(
  pool: Queryable,
  tenantId: string,
  leadId: string,
  limit: number,
  cursor?: { occurredAt: Date; sourceRank: number; id: string },
  sourceRank = 1,
): Promise<LeadActivity[]> {
  const result = await pool.query<LeadActivityRow>(
    `select * from lead_activity
     where tenant_id = $1 and lead_id = $2
       and ($4::timestamptz is null or (created_at, $5::int, id) < ($4::timestamptz, $5::int, $6::text))
     order by created_at desc, id desc
     limit $3`,
    [tenantId, leadId, limit, cursor?.occurredAt ?? null, sourceRank, cursor?.id ?? ""],
  );
  return result.rows.map(toLeadActivity);
}
