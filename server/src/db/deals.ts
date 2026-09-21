import type { Pool } from "pg";
import { recordLeadActivity } from "./leadActivity.js";

export type DealStage = "open" | "won" | "lost";

export interface Deal {
  id: string;
  tenantId: string;
  customerId: string;
  leadId: string;
  stage: DealStage;
  value: number | null;
  currency: string;
  ownerUserId: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
}

interface DealRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  lead_id: string;
  stage: DealStage;
  value: string | null; // numeric comes back as string from pg
  currency: string;
  owner_user_id: string | null;
  won_at: Date | null;
  lost_at: Date | null;
  created_at: Date;
}

function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    leadId: row.lead_id,
    stage: row.stage,
    value: row.value === null ? null : Number(row.value),
    currency: row.currency,
    ownerUserId: row.owner_user_id,
    wonAt: row.won_at,
    lostAt: row.lost_at,
    createdAt: row.created_at,
  };
}

/**
 * Phase 2A Data Model Amendment: schema now, UI/revenue-reporting later
 * (Phase 4). `customerId` is required, not looked up here, because every
 * caller already has the lead in hand (routes/leads.ts) and leads.customer_id
 * has been non-null-in-practice since Phase 1's backfill.
 */
export async function createDeal(
  pool: Pool,
  params: { tenantId: string; customerId: string; leadId: string; value?: number | null; currency?: string; ownerUserId?: string | null; actorUserId?: string | null },
): Promise<Deal> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DealRow>(
      `insert into deals (tenant_id, customer_id, lead_id, value, currency, owner_user_id)
       values ($1, $2, $3, $4, coalesce($5, 'USD'), $6)
       returning *`,
      [
        params.tenantId,
        params.customerId,
        params.leadId,
        params.value ?? null,
        params.currency ?? null,
        params.ownerUserId ?? null,
      ],
    );
    const deal = toDeal(result.rows[0]!);

    await recordLeadActivity(client, {
      tenantId: params.tenantId,
      leadId: params.leadId,
      actorUserId: params.actorUserId ?? null,
      type: "deal_created",
      summary: deal.value ? `Deal created — ${deal.currency} ${deal.value}` : "Deal created",
    });

    await client.query("COMMIT");
    return deal;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listDealsForLead(pool: Pool, tenantId: string, leadId: string): Promise<Deal[]> {
  const result = await pool.query<DealRow>(
    `select * from deals where tenant_id = $1 and lead_id = $2 order by created_at desc`,
    [tenantId, leadId],
  );
  return result.rows.map(toDeal);
}

/** Setting stage to 'won'/'lost' stamps the matching timestamp; moving back to 'open' (a correction) clears both rather than leaving a stale won_at/lost_at behind. */
export async function updateDealStage(
  pool: Pool,
  params: { tenantId: string; dealId: string; stage: DealStage; actorUserId?: string | null },
): Promise<Deal | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DealRow>(
      `update deals set
         stage = $3,
         won_at = case when $3 = 'won' then now() else null end,
         lost_at = case when $3 = 'lost' then now() else null end
       where id = $1 and tenant_id = $2
       returning *`,
      [params.dealId, params.tenantId, params.stage],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const deal = toDeal(result.rows[0]);

    await recordLeadActivity(client, {
      tenantId: params.tenantId,
      leadId: deal.leadId,
      actorUserId: params.actorUserId ?? null,
      type: "deal_stage_changed",
      summary: `Deal marked ${params.stage}`,
    });

    await client.query("COMMIT");
    return deal;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
