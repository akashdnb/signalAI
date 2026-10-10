import { Router } from "express";
import { getPool } from "../db/pool.js";
import { config } from "../config.js";
import type { HandoffStatus, PipelineStage } from "../db/leads.js";
import { getLeadTimelinePage, decodeTimelineCursor } from "../db/leadTimeline.js";
import type { Campaign, CampaignLanguage, CampaignTone, ReplyChannel, ReplyMode, TriggerSource } from "../db/campaigns.js";
import type { KnowledgeBaseDocument, KnowledgeBaseDocumentStatus } from "../db/knowledgeBase.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TIMELINE_DEFAULT_PAGE_SIZE = 50;
const TIMELINE_MAX_PAGE_SIZE = 200;

export interface PaginatedResponse<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number; }

function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const rawPage = Number(query.page);
  const rawPageSize = Number(query.pageSize);
  return { page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1, pageSize: Number.isInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE };
}

function toPage<T>(items: T[], requestedPage: number, pageSize: number, total: number): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items, page: Math.min(requestedPage, totalPages), pageSize, total, totalPages };
}

function parseString(query: Record<string, unknown>, key: string): string | undefined {
  return typeof query[key] === "string" && query[key] ? query[key] as string : undefined;
}

function hasExplicitPagination(query: Record<string, unknown>): boolean {
  return query.page !== undefined || query.pageSize !== undefined;
}

const VALID_PIPELINE_STAGES: PipelineStage[] = ["new", "contacted", "qualified", "meeting_scheduled", "won", "lost"];
const VALID_HANDOFF_STATUSES: HandoffStatus[] = ["ai", "requested", "human"];
const VALID_CAMPAIGN_TRIGGERS: TriggerSource[] = ["comment", "message", "both"];
const VALID_CAMPAIGN_SORTS = ["updated_desc", "updated_asc", "name_asc", "name_desc"] as const;
type CampaignSort = (typeof VALID_CAMPAIGN_SORTS)[number];

function mapCampaign(row: {
  id: string; tenant_id: string; name: string; description: string | null; keywords: string[]; enabled: boolean;
  has_published_version?: boolean;
  reply_mode: ReplyMode; reply_templates: string[]; default_reply_template: string; cta_link: string | null;
  target_media_ids: string[]; reply_channel: ReplyChannel; trigger_source: TriggerSource; tone: CampaignTone;
  language: CampaignLanguage; use_knowledge_base: boolean; created_at: Date; updated_at: Date;
}): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    keywords: row.keywords,
    enabled: row.enabled,
    published: row.has_published_version ?? false,
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
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: {
  id: string; tenant_id: string; filename: string; content_type: string; storage_key: string; version: number;
  status: KnowledgeBaseDocumentStatus; error_reason: string | null; superseded_at: Date | null; created_at: Date;
}): KnowledgeBaseDocument {
  return { id: row.id, tenantId: row.tenant_id, filename: row.filename, contentType: row.content_type, storageKey: row.storage_key, version: row.version, status: row.status, errorReason: row.error_reason, supersededAt: row.superseded_at, createdAt: row.created_at };
}

export const paginationRouter = Router();
paginationRouter.use("/tenants/:tenantId", requireTenantSession);

// Cursor-paginated timeline is mounted here because paginationRouter is
// registered before the legacy leads router. The old route remains as a
// compatibility fallback, while this route owns the opaque cursor contract.
paginationRouter.get("/tenants/:tenantId/leads/:leadId/timeline", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const leadResult = await getPool().query("select 1 from leads where id = $1 and tenant_id = $2", [leadId, tenantId]);
  if (leadResult.rowCount === 0) return res.status(404).json({ error: "lead not found for this tenant" });
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, TIMELINE_MAX_PAGE_SIZE) : TIMELINE_DEFAULT_PAGE_SIZE;
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  if (before) {
    try { decodeTimelineCursor(before); } catch { return res.status(400).json({ error: "before must be a valid timeline cursor" }); }
  }
  return res.status(200).json(await getLeadTimelinePage(getPool(), tenantId, leadId, limit, before));
});

paginationRouter.get("/tenants/:tenantId/leads", async (req, res) => {
  const tenantId = req.params.tenantId;
  const query = req.query as Record<string, unknown>;
  const { page: requestedPage, pageSize } = parsePagination(query);
  const { stage, ownerUserId, q, tagId, handoffStatus, unread } = query;
  if (stage !== undefined && !VALID_PIPELINE_STAGES.includes(stage as PipelineStage)) return res.status(400).json({ error: `stage must be one of ${VALID_PIPELINE_STAGES.join(", ")}` });
  if (handoffStatus !== undefined && !VALID_HANDOFF_STATUSES.includes(handoffStatus as HandoffStatus)) return res.status(400).json({ error: `handoffStatus must be one of ${VALID_HANDOFF_STATUSES.join(", ")}` });
  const conditions = ["l.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (stage) { params.push(stage); conditions.push(`l.pipeline_stage = $${params.length}`); }
  if (typeof ownerUserId === "string" && ownerUserId) { params.push(ownerUserId); conditions.push(`l.owner_user_id = $${params.length}`); }
  if (typeof tagId === "string" && tagId) { params.push(tagId); conditions.push(`exists (select 1 from lead_tags lt where lt.lead_id = l.id and lt.tag_id = $${params.length})`); }
  if (typeof q === "string" && q.trim()) { params.push(`%${q.trim()}%`); conditions.push(`exists (select 1 from lead_pii p2 where p2.lead_id = l.id and p2.deleted_at is null and p2.username ilike $${params.length})`); }
  if (handoffStatus) { params.push(handoffStatus); conditions.push(`l.handoff_status = $${params.length}`); }
  if (unread === "true") conditions.push(`l.last_inbound_at is not null and (l.last_read_at is null or l.last_inbound_at > l.last_read_at)`);
  const pool = getPool();
  const where = conditions.join(" and ");
  const countResult = await pool.query<{ count: string }>(`select count(*)::int as count from leads l where ${where}`, params);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const dataParams = [...params, pageSize, offset];
  const result = await pool.query<{
    id: string; instagram_user_id: string | null; username: string | null; last_event_type: string | null; last_message_preview: string | null;
    unread: boolean; active_milestone_id: string | null; last_inbound_at: Date | null; window_open_until: Date | null; last_dm_at: Date | null; created_at: Date;
    pipeline_stage: PipelineStage; owner_user_id: string | null; handoff_status: HandoffStatus;
  }>(
    `select l.id, l.instagram_user_id, l.active_milestone_id, l.last_inbound_at, l.window_open_until, last_dm.last_dm_at, l.created_at, l.pipeline_stage, l.owner_user_id, l.handoff_status,
            p.username, e.event_type as last_event_type, coalesce(pii.comment_text, pii.dm_text) as last_message_preview,
            (l.last_inbound_at is not null and (l.last_read_at is null or l.last_inbound_at > l.last_read_at)) as unread
     from leads l
     left join lateral (select username from lead_pii where lead_id = l.id and deleted_at is null and username is not null order by created_at desc limit 1) p on true
     left join lateral (select occurred_at as last_dm_at from lead_events where tenant_id = l.tenant_id and lead_id = l.id and event_type = 'message' order by occurred_at desc, id desc limit 1) last_dm on true
     left join lateral (select id, event_type from lead_events where lead_id = l.id order by occurred_at desc, id desc limit 1) e on true
     left join lateral (select comment_text, dm_text from lead_pii where lead_event_id = e.id and deleted_at is null) pii on true
     where ${where}
     order by coalesce(l.last_inbound_at, l.created_at) desc, l.id desc
     limit $${dataParams.length - 1} offset $${dataParams.length}`,
    dataParams,
  );
  const items = result.rows.map((row) => ({ id: row.id, instagramUserId: row.instagram_user_id, username: row.username, lastEventType: row.last_event_type, lastMessagePreview: row.last_message_preview, unread: row.unread, activeMilestoneId: row.active_milestone_id, lastInboundAt: row.last_inbound_at, windowOpenUntil: row.last_dm_at ? new Date(row.last_dm_at.getTime() + 24 * 60 * 60 * 1000).toISOString() : null, humanAgentWindowUntil: config.instagramHumanAgentEnabled && row.last_dm_at ? new Date(row.last_dm_at.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : null, createdAt: row.created_at, pipelineStage: row.pipeline_stage, ownerUserId: row.owner_user_id, handoffStatus: row.handoff_status }));
  return res.status(200).json(hasExplicitPagination(query) ? toPage(items, page, pageSize, total) : items);
});

paginationRouter.get("/tenants/:tenantId/campaigns", async (req, res) => {
  const tenantId = req.params.tenantId;
  const query = req.query as Record<string, unknown>;
  const { page: requestedPage, pageSize } = parsePagination(query);
  const search = parseString(query, "q")?.trim();
  const status = parseString(query, "status");
  const trigger = parseString(query, "trigger");
  const sortValue = parseString(query, "sort") ?? "updated_desc";
  if (status !== undefined && status !== "all" && status !== "active" && status !== "inactive") return res.status(400).json({ error: "status must be all, active or inactive" });
  if (trigger !== undefined && trigger !== "all" && !VALID_CAMPAIGN_TRIGGERS.includes(trigger as TriggerSource)) return res.status(400).json({ error: `trigger must be all or one of ${VALID_CAMPAIGN_TRIGGERS.join(", ")}` });
  if (!VALID_CAMPAIGN_SORTS.includes(sortValue as CampaignSort)) return res.status(400).json({ error: `sort must be one of ${VALID_CAMPAIGN_SORTS.join(", ")}` });
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (status === "active") conditions.push("enabled = true");
  if (status === "inactive") conditions.push("enabled = false");
  if (trigger && trigger !== "all") { params.push(trigger); conditions.push(`trigger_source = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(name ilike $${params.length} or coalesce(description, '') ilike $${params.length} or exists (select 1 from unnest(keywords) keyword where keyword ilike $${params.length}))`); }
  const where = conditions.join(" and ");
  const pool = getPool();
  const countResult = await pool.query<{ count: string }>(`select count(*)::int as count from campaigns where ${where}`, params);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const orderBy = { updated_desc: "updated_at desc, id desc", updated_asc: "updated_at asc, id asc", name_asc: "name asc, id asc", name_desc: "name desc, id desc" }[sortValue as CampaignSort];
  const result = await pool.query<{
    id: string; tenant_id: string; name: string; description: string | null; keywords: string[]; enabled: boolean;
    has_published_version: boolean; reply_mode: ReplyMode;
    reply_templates: string[]; default_reply_template: string; cta_link: string | null; target_media_ids: string[]; reply_channel: ReplyChannel;
    trigger_source: TriggerSource; tone: CampaignTone; language: CampaignLanguage; use_knowledge_base: boolean; created_at: Date; updated_at: Date;
  }>(
    `select campaigns.*,
            exists (
              select 1
                from campaign_journey_versions published
               where published.tenant_id = campaigns.tenant_id
                 and published.campaign_id = campaigns.id
            ) as has_published_version
       from campaigns
       where ${where}
       order by ${orderBy}
       limit ${params.length + 1} offset ${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const items = result.rows.map(mapCampaign);
  return res.status(200).json(hasExplicitPagination(query) ? toPage(items, page, pageSize, total) : items);
});

paginationRouter.get("/tenants/:tenantId/knowledge-base", async (req, res) => {
  const tenantId = req.params.tenantId;
  const query = req.query as Record<string, unknown>;
  const { page: requestedPage, pageSize } = parsePagination(query);
  const pool = getPool();
  // Preserve listDocumentsForTenant semantics exactly: all versions, including superseded versions.
  const countResult = await pool.query<{ count: string }>(`select count(*)::int as count from knowledge_base_documents where tenant_id = $1`, [tenantId]);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const result = await pool.query<{
    id: string; tenant_id: string; filename: string; content_type: string; storage_key: string; version: number;
    status: KnowledgeBaseDocumentStatus; error_reason: string | null; superseded_at: Date | null; created_at: Date;
  }>(`select * from knowledge_base_documents where tenant_id = $1 order by filename asc, version desc, id asc limit $2 offset $3`, [tenantId, pageSize, offset]);
  const items = result.rows.map(mapDocument);
  return res.status(200).json(hasExplicitPagination(query) ? toPage(items, page, pageSize, total) : { documents: items });
});
