import type { Pool } from "pg";

export type ReplyMode = "rule_based" | "ai_generated";

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  replyMode: ReplyMode;
  replyTemplates: string[];
  defaultReplyTemplate: string;
  createdAt: Date;
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  reply_mode: ReplyMode;
  reply_templates: string[];
  default_reply_template: string;
  created_at: Date;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keywords: row.keywords,
    enabled: row.enabled,
    replyMode: row.reply_mode,
    replyTemplates: row.reply_templates,
    defaultReplyTemplate: row.default_reply_template,
    createdAt: row.created_at,
  };
}

export async function createCampaign(
  pool: Pool,
  tenantId: string,
  name: string,
  keywords: string[],
  options?: { replyMode?: ReplyMode; replyTemplates?: string[]; defaultReplyTemplate?: string },
): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `insert into campaigns (tenant_id, name, keywords, reply_mode, reply_templates, default_reply_template)
     values ($1, $2, $3,
       coalesce($4, 'rule_based'),
       coalesce($5, array[]::text[]),
       coalesce($6, 'Thanks for your comment! We''ll be in touch shortly.'))
     returning *`,
    [
      tenantId,
      name,
      keywords,
      options?.replyMode ?? null,
      options?.replyTemplates ?? null,
      options?.defaultReplyTemplate ?? null,
    ],
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

export async function getCampaign(pool: Pool, tenantId: string, campaignId: string): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `select * from campaigns where id = $1 and tenant_id = $2`,
    [campaignId, tenantId],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
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
