import type { Pool } from "pg";

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  createdAt: Date;
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  created_at: Date;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keywords: row.keywords,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function createCampaign(
  pool: Pool,
  tenantId: string,
  name: string,
  keywords: string[],
): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `insert into campaigns (tenant_id, name, keywords) values ($1, $2, $3) returning *`,
    [tenantId, name, keywords],
  );
  return toCampaign(result.rows[0]!);
}

export async function listCampaigns(pool: Pool, tenantId: string): Promise<Campaign[]> {
  const result = await pool.query<CampaignRow>(
    `select * from campaigns where tenant_id = $1 order by created_at desc`,
    [tenantId],
  );
  return result.rows.map(toCampaign);
}

/** Only what the matcher needs, for the hot ingestion path — not the full row. */
export async function listActiveCampaignKeywords(
  pool: Pool,
  tenantId: string,
): Promise<Array<{ id: string; keywords: string[] }>> {
  const result = await pool.query<{ id: string; keywords: string[] }>(
    `select id, keywords from campaigns where tenant_id = $1 and enabled = true`,
    [tenantId],
  );
  return result.rows;
}

export async function setCampaignEnabled(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await pool.query(
    `update campaigns set enabled = $3, updated_at = now() where id = $1 and tenant_id = $2`,
    [campaignId, tenantId, enabled],
  );
  return result.rowCount === 1;
}
