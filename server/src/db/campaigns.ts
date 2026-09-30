import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export type ReplyMode = "rule_based" | "ai_generated";

/** Where a triggered reply is delivered: a private DM, a public reply under the comment, or both. Default 'dm' preserves every existing campaign's current behaviour. */
export type ReplyChannel = "dm" | "comment" | "both";

/** What kind of inbound event a campaign's keywords match against — a comment, a DM, or either. Distinct from ReplyChannel (where the reply goes, not what triggers it). Default 'comment' preserves every existing campaign's current behaviour, since DM-triggered matching didn't exist before this field. */
export type TriggerSource = "comment" | "message" | "both";

/** AI Behaviour panel (UI revamp R3): a coarse tone knob alongside the tenant-wide free-text brandVoice — both get interpolated into the same prompt. */
export type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
/** 'auto' (default) leaves reply language unspecified, identical to every pre-R3 campaign's behavior. */
export type CampaignLanguage = "auto" | "en" | "hi";

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
  /** Which post(s) this campaign matches comments on. Empty = every post (today's behaviour). Irrelevant to a message-triggered match — a DM isn't "on" a post. */
  targetMediaIds: string[];
  replyChannel: ReplyChannel;
  triggerSource: TriggerSource;
  tone: CampaignTone;
  language: CampaignLanguage;
  /** Per-campaign override of the tenant's always-on-whenever-documents-exist RAG — default true preserves every existing campaign's current behavior. */
  useKnowledgeBase: boolean;
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
  target_media_ids: string[];
  reply_channel: ReplyChannel;
  trigger_source: TriggerSource;
  tone: CampaignTone;
  language: CampaignLanguage;
  use_knowledge_base: boolean;
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
    targetMediaIds: row.target_media_ids,
    replyChannel: row.reply_channel,
    triggerSource: row.trigger_source,
    tone: row.tone,
    language: row.language,
    useKnowledgeBase: row.use_knowledge_base,
    createdAt: row.created_at,
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
  },
): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `insert into campaigns (tenant_id, name, keywords, reply_mode, reply_templates, default_reply_template, cta_link, target_media_ids, reply_channel, trigger_source)
     values ($1, $2, $3,
       coalesce($4, 'rule_based'),
       coalesce($5, array[]::text[]),
       coalesce($6, 'Thanks for your comment! We''ll be in touch shortly.'),
       $7,
       coalesce($8, array[]::text[]),
       coalesce($9, 'dm'),
       coalesce($10, 'comment'))
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
    ],
  );
  return toCampaign(result.rows[0]!);
}

// tone/language/useKnowledgeBase are deliberately left off createCampaign's
// options — every campaign is created with the schema defaults
// ('professional_and_friendly' / 'auto' / true) and configured afterward
// via updateCampaignReplyConfig, same as replyMode/replyChannel already are.

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
): Promise<Array<{ id: string; keywords: string[]; targetMediaIds: string[]; triggerSource: TriggerSource }>> {
  const result = await pool.query<{
    id: string;
    keywords: string[];
    target_media_ids: string[];
    trigger_source: TriggerSource;
  }>(`select id, keywords, target_media_ids, trigger_source from campaigns where tenant_id = $1 and enabled = true`, [
    tenantId,
  ]);
  return result.rows.map((row) => ({
    id: row.id,
    keywords: row.keywords,
    targetMediaIds: row.target_media_ids,
    triggerSource: row.trigger_source,
  }));
}

/**
 * BUI: the campaign editor's post-targeting picker. Replaced wholesale on
 * each save, same shape as `setCampaignMilestones` — an empty array means
 * "every post" (today's behaviour), not "no posts match".
 */
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

/**
 * Phase 2A "Multiple DM Variations" — replaced wholesale on each save,
 * same shape as setCampaignTargetMediaIds. An empty array falls back to
 * defaultReplyTemplate (see replyEngine.ts's pickReplyTemplate) — that's
 * every existing campaign's current behavior, left unaffected.
 */
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
      updates.replyChannel ?? null,
      updates.triggerSource ?? null,
      updates.tone ?? null,
      updates.language ?? null,
      updates.useKnowledgeBase !== undefined, // same "was it sent at all" trick as ctaLink — useKnowledgeBase: false must not coalesce away
      updates.useKnowledgeBase ?? null,
      updates.keywords ?? null,
    ],
  );
  return result.rows[0] ? toCampaign(result.rows[0]) : null;
}
