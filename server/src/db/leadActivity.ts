import type { Queryable } from "./types.js";

export type LeadActivityType =
  | "note"
  | "handoff"
  | "assignment"
  | "stage_change"
  | "tag_change"
  | "deal_created"
  | "note_added"
  | "owner_assigned"
  | "handoff_changed"
  | "tag_added"
  | "tag_removed"
  | "deal_stage_changed"
  | "pipeline_stage_changed";

export interface LeadActivity {
  id: string;
  tenantId: string;
  leadId: string;
  actorUserId: string | null;
  type: LeadActivityType;
  summary: string;
  createdAt: Date;
}

interface LeadActivityRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  actor_user_id: string | null;
  type: LeadActivityType;
  summary: string;
  created_at: Date;
}

function toLeadActivity(row: LeadActivityRow): LeadActivity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

export async function createLeadActivity(
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

export const recordLeadActivity = createLeadActivity;

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
       and ($4::timestamptz is null or created_at < $4::timestamptz
            or (created_at = $4::timestamptz and ($5::int < $7::int or ($5::int = $7::int and id::text < $6::text))))
     order by created_at desc, id desc
     limit $3`,
    [tenantId, leadId, limit, cursor?.occurredAt ?? null, sourceRank, cursor?.id ?? "", cursor?.sourceRank ?? sourceRank],
  );
  return result.rows.map(toLeadActivity);
}
