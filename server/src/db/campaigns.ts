import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export type ReplyMode = "rule_based" | "ai_generated";
export type ReplyChannel = "dm" | "comment" | "both";
export type TriggerSource = "comment" | "message" | "both";
export type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
export type CampaignLanguage = "auto" | "en" | "hi";

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  keywords: string[];
  enabled: boolean;
  published?: boolean;
  replyMode: ReplyMode;
  replyTemplates: string[];
  defaultReplyTemplate: string;
  ctaLink: string | null;
  targetMediaIds: string[];
  replyChannel: ReplyChannel;
  triggerSource: TriggerSource;
  tone: CampaignTone;
  language: CampaignLanguage;
  useKnowledgeBase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  keywords: string[];
  enabled: boolean;
  published?: boolean;
  reply_mode: ReplyMode;
  reply_templates: string[];
  default_reply_template: string;
  cta_link: string | null;
  target_media_ids: string[];
  reply_channel: ReplyChannel;
  trigger_source: TriggerSource;
  tone: CampaignTone;
  language: CampaignLanguage;
  use_knowledge_base: boolean;
  created_at: Date;
  updated_at: Date;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    keywords: row.keywords,
    enabled: row.enabled,
    published: row.published ?? false,
    replyMode: row.reply_mode,
    replyTemplates: row.reply_templates,
    defaultReplyTemplate: row.default_reply_template,
    ctaLink: row.cta_link,
    targetMediaIds: row.target_media_ids,
    replyChannel: row.reply_channel,
    tone: row.tone,
    language: row.language,
    useKnowledgeBase: row.use_knowledge_base,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCampaign(
  pool: Pool,
  tenantId: string,
  name: string,
  keywords: string[],
  options?: {
    replyMode?: ReplyMode;
    replyTemplates?: string[];
    defaultReplyTemplate?: string;
    ctaLink?: string;
    targetMediaIds?: string[];
    replyChannel?: ReplyChannel;
    triggerSource?: TriggerSource;
    enabled?: boolean;
  },
): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `insert into campaigns (tenant_id, name, keywords, reply_mode, reply_templates, default_reply_template, cta_link, target_media_ids, reply_channel, trigger_source, enabled)
     values ($1, $2, $3,
       coalesce($4, 'rule_based'),
       coalesce($5, array[]::text[]),
       coalesce($6, 'Thanks for your comment! We''ll be in touch shortly.'),
       $7,
       coalesce($8, array[]::text[]),
       coalesce($9, 'dm'),
       coalesce($10, 'comment'),
       coalesce($11, true))
     returning *`,
    [
      tenantId,
      name,
      keywords,
      options?.replyMode ?? null,
      options?.replyTemplates ?? null,
      options?.defaultReplyTemplate ?? null,
      options?.ctaLink ?? null,
      options?.targetMediaIds ?? null,
      options?.replyChannel ?? null,
      options?.triggerSource ?? null,
      options?.enabled ?? true,
    ],
  );
  return toCampaign(result.rows[0]!);
}

export async function listCampaigns(pool: Pool, tenantId: string): Promise<Campaign[]> {
  const result = await pool.query<CampaignRow>(
    `select campaigns.*,
            exists (
              select 1 from campaign_journey_versions published
               where published.tenant_id = campaigns.tenant_id
                 and published.campaign_id = campaigns.id
            ) as published
       from campaigns
      where campaigns.tenant_id = $1
      order by campaigns.created_at desc`,
    [tenantId],
  );
  return result.rows.map(toCampaign);
}

export async function getCampaign(pool: Pool, tenantId: string, campaignId: string): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `select campaigns.*,
            exists (
              select 1 from campaign_journey_versions published
               where published.tenant_id = campaigns.tenant_id
                 and published.campaign_id = campaigns.id
            ) as published
       from campaigns
      where campaigns.id = $1 and campaigns.tenant_id = $2`,
    [campaignId, tenantId],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}

export async function listActiveCampaignKeywords(
  pool: Queryable,
  tenantId: string,
): Promise<Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource; replyChannel: ReplyChannel }>> {
  const result = await pool.query<{
    id: string;
    keywords: string[];
    target_media_ids: string[];
    trigger_source: TriggerSource;
    reply_channel: ReplyChannel;
  }>(`select id, keywords, target_media_ids, trigger_source, reply_channel from campaigns where tenant_id = $1 and enabled = true`, [tenantId]);
  return result.rows.map((row) => ({
    id: row.id,
    keywords: row.keywords,
    targetMediaIds: row.target_media_ids,
    triggerSource: row.trigger_source,
    replyChannel: row.reply_channel,
  }));
}

export async function setCampaignTargetMediaIds(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  targetMediaIds: string[],
): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `update campaigns set target_media_ids = $3, updated_at = now() where id = $1 and tenant_id = $2 returning *`,
    [campaignId, tenantId, targetMediaIds],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}

export async function setCampaignReplyTemplates(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  replyTemplates: string[],
): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `update campaigns set reply_templates = $3, updated_at = now() where id = $1 and tenant_id = $2 returning *`,
    [campaignId, tenantId, replyTemplates],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}

export async function setCampaignEnabled(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await pool.query(
    `update campaigns
        set enabled = $3, updated_at = now()
      where id = $1
        and tenant_id = $2
        and ($3 = false or (
          exists (
            select 1 from campaign_journey_versions published
             where published.tenant_id = campaigns.tenant_id
               and published.campaign_id = campaigns.id
          )
          and exists (
            select 1
              from campaign_instagram_accounts cia
              join meta_tokens mt on mt.id = cia.meta_token_id
             where cia.campaign_id = campaigns.id
               and cia.enabled = true
               and mt.tenant_id = campaigns.tenant_id
               and mt.status = 'healthy'
          )
        ))`,
    [campaignId, tenantId, enabled],
  );
  return result.rowCount === 1;
}

export async function updateCampaignReplyConfig(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  updates: {
    replyMode?: ReplyMode;
    ctaLink?: string | null;
    defaultReplyTemplate?: string;
    replyChannel?: ReplyChannel;
    triggerSource?: TriggerSource;
    tone?: CampaignTone;
    language?: CampaignLanguage;
    useKnowledgeBase?: boolean;
    keywords?: string[];
    name?: string;
    description?: string | null;
  },
): Promise<Campaign | null> {
  const result = await pool.query<CampaignRow>(
    `update campaigns set
       reply_mode = coalesce($3, reply_mode),
       cta_link = case when $4::boolean then $5 else cta_link end,
       default_reply_template = coalesce($6, default_reply_template),
       reply_channel = coalesce($7, reply_channel),
       trigger_source = coalesce($8, trigger_source),
       tone = coalesce($9, tone),
       language = coalesce($10, language),
       use_knowledge_base = case when $11::boolean then $12 else use_knowledge_base end,
       keywords = coalesce($13, keywords),
       name = coalesce($14, name),
       description = case when $15::boolean then $16 else description end,
       updated_at = now()
     where id = $1 and tenant_id = $2
     returning *`,
    [
      campaignId,
      tenantId,
      updates.replyMode ?? null,
      updates.ctaLink !== undefined,
      updates.ctaLink ?? null,
      updates.defaultReplyTemplate ?? null,
      updates.replyChannel ?? null,
      updates.triggerSource ?? null,
      updates.tone ?? null,
      updates.language ?? null,
      updates.useKnowledgeBase !== undefined,
      updates.useKnowledgeBase ?? null,
      updates.keywords ?? null,
      updates.name ?? null,
      updates.description !== undefined,
      updates.description ?? null,
    ],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}