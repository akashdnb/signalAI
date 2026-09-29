import { Router } from "express";
import { getPool } from "../db/pool.js";
import { getTenant } from "../db/tenants.js";
import { getAccountHealth } from "../db/tokens.js";
import { listLeadsForTenant, type HandoffStatus, type PipelineStage } from "../db/leads.js";
import { getMilestoneDropoff, getTenantAnalytics } from "../db/analytics.js";
import {
  getCampaign,
  updateCampaignReplyConfig,
  type CampaignLanguage,
  type CampaignTone,
  type ReplyChannel,
  type ReplyMode,
  type TriggerSource,
} from "../db/campaigns.js";
import { generateReply, type RagDependencies } from "../services/replyEngine.js";
import { getGuardrailsConfig } from "../db/guardrailsConfig.js";
import type { LLMProvider } from "../llm/provider.js";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

const UNCONFIGURED_PREVIEW_PROVIDER: LLMProvider = {
  name: "unconfigured",
  generateReply: async () => {
    throw new Error("LLM provider not configured for this server");
  },
};

/**
 * BUI's read/config surface: tenant summary, Account Health, the lead
 * list, analytics, milestone drop-off, the reply-mode/CTA/template PATCH,
 * and the reply preview. Grouped separately from campaigns.ts (which owns
 * campaign/milestone CRUD) since this router needs the LLM provider for
 * previews and campaigns.ts doesn't.
 */
export function dashboardRouter(
  llmProvider: LLMProvider = UNCONFIGURED_PREVIEW_PROVIDER,
  embeddingProvider: EmbeddingProvider | null = null,
) {
  const router = Router();

  // R10-01 fix: every route here reads or writes one tenant's data —
  // gated on the bearer session issued at connect time.
  router.use("/tenants/:tenantId", requireTenantSession);

  router.get("/tenants/:tenantId", async (req, res) => {
    const tenant = await getTenant(getPool(), req.params.tenantId);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    return res.status(200).json({ id: tenant.id, name: tenant.name, billingStatus: tenant.billingStatus });
  });

  router.get("/tenants/:tenantId/account", async (req, res) => {
    const health = await getAccountHealth(getPool(), req.params.tenantId);
    if (!health) return res.status(200).json({ connected: false });
    return res.status(200).json({ connected: true, ...health });
  });

  const VALID_PIPELINE_STAGES: PipelineStage[] = ["new", "contacted", "qualified", "meeting_scheduled", "won", "lost"];
  const VALID_HANDOFF_STATUSES: HandoffStatus[] = ["ai", "requested", "human"];

  // Phase 2A Lead Filters/Lead Search, extended for the Inbox's filter tabs
  // (handoffStatus, unread): all optional, all AND'd together.
  router.get("/tenants/:tenantId/leads", async (req, res) => {
    const { stage, ownerUserId, q, tagId, handoffStatus, unread } = req.query;
    if (stage !== undefined && !VALID_PIPELINE_STAGES.includes(stage as PipelineStage)) {
      return res.status(400).json({ error: `stage must be one of ${VALID_PIPELINE_STAGES.join(", ")}` });
    }
    if (handoffStatus !== undefined && !VALID_HANDOFF_STATUSES.includes(handoffStatus as HandoffStatus)) {
      return res.status(400).json({ error: `handoffStatus must be one of ${VALID_HANDOFF_STATUSES.join(", ")}` });
    }
    const leads = await listLeadsForTenant(getPool(), req.params.tenantId, 100, {
      stage: stage as PipelineStage | undefined,
      ownerUserId: typeof ownerUserId === "string" ? ownerUserId : undefined,
      q: typeof q === "string" ? q : undefined,
      tagId: typeof tagId === "string" ? tagId : undefined,
      handoffStatus: handoffStatus as HandoffStatus | undefined,
      unreadOnly: unread === "true",
    });
    return res.status(200).json(leads);
  });

  router.get("/tenants/:tenantId/analytics", async (req, res) => {
    const analytics = await getTenantAnalytics(getPool(), req.params.tenantId);
    return res.status(200).json(analytics);
  });

  router.get("/tenants/:tenantId/campaigns/:campaignId/dropoff", async (req, res) => {
    const { tenantId, campaignId } = req.params;
    const dropoff = await getMilestoneDropoff(getPool(), tenantId, campaignId);
    return res.status(200).json(dropoff);
  });

  const VALID_REPLY_MODES: ReplyMode[] = ["rule_based", "ai_generated"];
  const VALID_REPLY_CHANNELS: ReplyChannel[] = ["dm", "comment", "both"];
  const VALID_TRIGGER_SOURCES: TriggerSource[] = ["comment", "message", "both"];
  const VALID_TONES: CampaignTone[] = ["professional", "friendly", "casual", "professional_and_friendly"];
  const VALID_LANGUAGES: CampaignLanguage[] = ["auto", "en", "hi"];

  router.patch("/tenants/:tenantId/campaigns/:campaignId/reply-config", async (req, res) => {
    const { tenantId, campaignId } = req.params;
    const { replyMode, ctaLink, defaultReplyTemplate, replyChannel, triggerSource, tone, language, useKnowledgeBase } = req.body ?? {};

    if (replyMode !== undefined && !VALID_REPLY_MODES.includes(replyMode)) {
      return res.status(400).json({ error: `replyMode must be one of ${VALID_REPLY_MODES.join(", ")}` });
    }
    if (ctaLink !== undefined && ctaLink !== null && typeof ctaLink !== "string") {
      return res.status(400).json({ error: "ctaLink must be a string or null" });
    }
    if (defaultReplyTemplate !== undefined && typeof defaultReplyTemplate !== "string") {
      return res.status(400).json({ error: "defaultReplyTemplate must be a string" });
    }
    if (replyChannel !== undefined && !VALID_REPLY_CHANNELS.includes(replyChannel)) {
      return res.status(400).json({ error: `replyChannel must be one of ${VALID_REPLY_CHANNELS.join(", ")}` });
    }
    if (triggerSource !== undefined && !VALID_TRIGGER_SOURCES.includes(triggerSource)) {
      return res.status(400).json({ error: `triggerSource must be one of ${VALID_TRIGGER_SOURCES.join(", ")}` });
    }
    if (tone !== undefined && !VALID_TONES.includes(tone)) {
      return res.status(400).json({ error: `tone must be one of ${VALID_TONES.join(", ")}` });
    }
    if (language !== undefined && !VALID_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: `language must be one of ${VALID_LANGUAGES.join(", ")}` });
    }
    if (useKnowledgeBase !== undefined && typeof useKnowledgeBase !== "boolean") {
      return res.status(400).json({ error: "useKnowledgeBase must be a boolean" });
    }

    const updated = await updateCampaignReplyConfig(getPool(), tenantId, campaignId, {
      replyMode,
      ctaLink,
      defaultReplyTemplate,
      replyChannel,
      triggerSource,
      tone,
      language,
      useKnowledgeBase,
    });
    if (!updated) return res.status(404).json({ error: "campaign not found for this tenant" });
    return res.status(200).json(updated);
  });

  /**
   * BUI: "a preview of a sample rule-based and AI-generated reply before
   * it goes live" — always returns both, regardless of the campaign's
   * currently configured mode, so a creator can compare before toggling.
   * Uses ALLOW_ALL_SPEND_GUARD implicitly (no guard passed) deliberately —
   * a preview the creator triggers by hand is not a real customer event
   * and shouldn't burn B10's per-account cap.
   *
   * Phase 2C: now passes the SAME `rag` dependencies (Knowledge Base
   * retrieval, Client Guardrails) the live leadEventReplyHandler.ts path
   * uses — previously this called generateReply with no `rag` argument at
   * all, so a preview could show a clean AI-generated reply while the real
   * DM/comment path silently routed to the Grounded-Answer-Only Fallback
   * or an escalation trigger, with nothing in the preview UI hinting why.
   * `requiresHumanHandoff` is now surfaced in the response for the same
   * reason `fellBackReason` already was — so that mismatch is visible
   * here instead of only discoverable by testing the real thing.
   */
  router.post("/tenants/:tenantId/campaigns/:campaignId/preview", async (req, res) => {
    const { tenantId, campaignId } = req.params;
    const { sampleText, sampleUsername, tier } = req.body ?? {};

    if (typeof sampleText !== "string" || !sampleText.trim()) {
      return res.status(400).json({ error: "sampleText is required" });
    }

    const pool = getPool();
    const campaign = await getCampaign(pool, tenantId, campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found for this tenant" });

    const tenantGuardrailsConfig = await getGuardrailsConfig(pool, tenantId);
    const rag: RagDependencies = { pool, embeddingProvider, tenantGuardrailsConfig };

    const previewCtx = {
      campaign,
      matchedKeyword: campaign.keywords[0] ?? "",
      sourceText: sampleText,
      username: typeof sampleUsername === "string" ? sampleUsername : "preview_user",
      tier: tier === "dm" ? ("dm" as const) : ("comment" as const),
      ctaLink: campaign.ctaLink ?? undefined,
    };

    const ruleBased = await generateReply(
      { ...previewCtx, campaign: { ...campaign, replyMode: "rule_based" } },
      llmProvider,
      undefined,
      rag,
    );
    const aiGenerated = await generateReply(
      { ...previewCtx, campaign: { ...campaign, replyMode: "ai_generated" } },
      llmProvider,
      undefined,
      rag,
    );

    return res.status(200).json({
      ruleBased: { text: ruleBased.text },
      aiGenerated: {
        text: aiGenerated.text,
        fellBackReason: aiGenerated.fellBackReason,
        requiresHumanHandoff: aiGenerated.requiresHumanHandoff,
      },
    });
  });

  return router;
}
