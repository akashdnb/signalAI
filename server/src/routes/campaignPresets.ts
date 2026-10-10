import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { getBuilderGraphWithClient, saveBuilderGraphWithClient, synchronizeMilestoneGraph } from "../db/journeyGraph.js";
import { listMilestonesWithClient, setCampaignMilestonesWithClient } from "../db/milestones.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

export const campaignPresetsRouter = Router();

campaignPresetsRouter.use("/tenants/:tenantId", requireTenantSession);

type ReplyMode = "rule_based" | "ai_generated";
type ReplyChannel = "dm" | "comment" | "both";
type TriggerSource = "comment" | "message" | "both";
type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
type CampaignLanguage = "auto" | "en" | "hi";

interface PresetMilestone {
  goalDescription: string;
  captureFields: string[];
}

interface PresetInput {
  triggerSource: TriggerSource;
  replyChannel: ReplyChannel;
  replyMode: ReplyMode;
  tone: CampaignTone;
  language: CampaignLanguage;
  defaultReplyTemplate: string;
  description: string;
  ctaLink?: string | null;
  useKnowledgeBase?: boolean;
  milestones?: PresetMilestone[];
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isValidMilestones(value: unknown): value is PresetMilestone[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;

  return value.every(
    (milestone) =>
      typeof milestone === "object" &&
      milestone !== null &&
      typeof (milestone as { goalDescription?: unknown }).goalDescription === "string" &&
      (milestone as { goalDescription: string }).goalDescription.trim().length > 0 &&
      Array.isArray((milestone as { captureFields?: unknown }).captureFields) &&
      (milestone as { captureFields: unknown[] }).captureFields.every((field) => typeof field === "string"),
  );
}

function validatePresetInput(name: unknown, keywords: unknown, preset: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "name is required";
  if (name.trim().length > 200) return "name must be at most 200 characters";
  if (
    !Array.isArray(keywords) ||
    keywords.length === 0 ||
    !keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0)
  ) {
    return "keywords must be a non-empty array of strings";
  }
  if (typeof preset !== "object" || preset === null) return "preset is required";

  const value = preset as Record<string, unknown>;
  if (!isOneOf(value.triggerSource, ["comment", "message", "both"] as const)) return "invalid triggerSource";
  if (!isOneOf(value.replyChannel, ["dm", "comment", "both"] as const)) return "invalid replyChannel";
  if (!isOneOf(value.replyMode, ["rule_based", "ai_generated"] as const)) return "invalid replyMode";
  if (!isOneOf(value.tone, ["professional", "friendly", "casual", "professional_and_friendly"] as const)) return "invalid tone";
  if (!isOneOf(value.language, ["auto", "en", "hi"] as const)) return "invalid language";
  if (typeof value.defaultReplyTemplate !== "string" || !value.defaultReplyTemplate.trim()) {
    return "defaultReplyTemplate is required";
  }
  if (typeof value.description !== "string") return "description must be a string";
  if (value.ctaLink !== undefined && value.ctaLink !== null && typeof value.ctaLink !== "string") {
    return "ctaLink must be a string or null";
  }
  if (value.useKnowledgeBase !== undefined && typeof value.useKnowledgeBase !== "boolean") {
    return "useKnowledgeBase must be a boolean";
  }
  if (!isValidMilestones(value.milestones)) return "milestones must be an array of valid milestone drafts";
  return null;
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
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
  updated_at: Date;
}

function toCampaign(row: CampaignRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
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
    updatedAt: row.updated_at,
  };
}

/**
 * Creates the complete starter journey in one PostgreSQL transaction.
 * Campaign configuration and milestone/graph state are intentionally written
 * on the same checked-out client so a failure in any step rolls back the
 * campaign itself instead of leaving a recoverable-but-partial draft.
 */
campaignPresetsRouter.post("/tenants/:tenantId/campaigns/from-preset", async (req, res) => {
  const { tenantId } = req.params;
  const { name, keywords, preset } = req.body ?? {};
  const validationError = validatePresetInput(name, keywords, preset);

  if (validationError) return res.status(400).json({ error: validationError });

  const value = preset as PresetInput;
  const pool = getPool();
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    const created = await client.query<CampaignRow>(
      `insert into campaigns (
         tenant_id,
         name,
         keywords,
         reply_mode,
         reply_templates,
         default_reply_template,
         cta_link,
         target_media_ids,
         reply_channel,
         trigger_source,
         tone,
         language,
         use_knowledge_base,
         description
       ) values (
         $1, $2, $3, $4, array[]::text[], $5, $6, array[]::text[],
         $7, $8, $9, $10, $11, $12
       ) returning *`,
      [
        tenantId,
        name.trim(),
        (keywords as string[]).map((keyword) => keyword.trim()),
        value.replyMode,
        value.defaultReplyTemplate.trim(),
        value.ctaLink ?? null,
        value.replyChannel,
        value.triggerSource,
        value.tone,
        value.language,
        value.useKnowledgeBase ?? true,
        value.description,
      ],
    );

    const campaign = created.rows[0];
    if (!campaign) throw new Error("campaign was not created");

    if (value.milestones && value.milestones.length > 0) {
      // New campaigns have no persisted graph yet. We still run the same
      // milestone -> graph synchronization used by the normal editor so the
      // preset is immediately represented correctly in the Builder.
      const graph = await getBuilderGraphWithClient(client, tenantId, campaign.id);
      if (!graph) throw new Error("campaign graph could not be initialized");

      const previousMilestones = await listMilestonesWithClient(client, tenantId, campaign.id);
      const savedMilestones = await setCampaignMilestonesWithClient(
        client,
        tenantId,
        campaign.id,
        value.milestones,
      );

      const synchronized = synchronizeMilestoneGraph(
        graph,
        previousMilestones,
        savedMilestones,
        previousMilestones.map(() => null),
      );

      const graphSave = await saveBuilderGraphWithClient(
        client,
        tenantId,
        campaign.id,
        graph.version,
        synchronized.nodes,
        synchronized.edges,
      );

      if (graphSave.status !== "ok") {
        throw new Error("could not initialize the preset journey graph");
      }
    }

    const finalCampaign = await client.query<CampaignRow>(
      `select * from campaigns where id = $1 and tenant_id = $2`,
      [campaign.id, tenantId],
    );

    await client.query("COMMIT");
    return res.status(201).json(toCampaign(finalCampaign.rows[0] ?? campaign));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
