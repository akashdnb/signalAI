import type { Pool } from "pg";
import type { Queryable } from "./types.js";

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
  ctaLink: string | null;
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
  cta_link: string | null;
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
    ctaLink: row.cta_link,
    createdAt: row.created_at,
  };
}

export async function createCampaign(
  pool: Pool,
  tenantId: string,
  name: string,
  keywords: string[],
  options?: { replyMode?: ReplyMode; replyTemplates?: string[]; defaultReplyTemplate?: string; ctaLink?: string },
): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `insert into campaigns (tenant_id, name, keywords, reply_mode, reply_templates, default_reply_template, cta_link)
     values ($1, $2, $3,
       coalesce($4, 'rule_based'),
       coalesce($5, array[]::text[]),
       coalesce($6, 'Thanks for your comment! We''ll be in touch shortly.'),
       $7)
     returning *`,
    [
      tenantId,
      name,
      keywords,
      options?.replyMode ?? null,
      options?.replyTemplates ?? null,
      options?.defaultReplyTemplate ?? null,
      options?.ctaLink ?? null,
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
  pool: Queryable,
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

/**
 * BUI: "reply-engine mode toggle per campaign," plus the CTA link and the
 * rule-based template — the rest of the creator's per-campaign reply
 * configuration beyond enabled/disabled and milestones. Each field is
 * `coalesce`d against its current value so a partial PATCH only ever
 * touches the fields it explicitly sent.
 */
export async function updateCampaignReplyConfig(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  updates: { replyMode?: ReplyMode; ctaLink?: string | null; defaultReplyTemplate?: string },
): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `update campaigns set
       reply_mode = coalesce($3, reply_mode),
       cta_link = case when $4::boolean then $5 else cta_link end,
       default_reply_template = coalesce($6, default_reply_template),
       updated_at = now()
     where id = $1 and tenant_id = $2
     returning *`,
    [
      campaignId,
      tenantId,
      updates.replyMode ?? null,
      updates.ctaLink !== undefined, // whether the caller sent ctaLink at all — coalesce can't distinguish "sent null" from "not sent"
      updates.ctaLink ?? null,
      updates.defaultReplyTemplate ?? null,
    ],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}
