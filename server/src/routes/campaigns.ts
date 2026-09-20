import { Router } from "express";
import { getPool } from "../db/pool.js";
import { createCampaign, listCampaigns, setCampaignEnabled, setCampaignTargetMediaIds } from "../db/campaigns.js";
import { listMilestones, setCampaignMilestones } from "../db/milestones.js";
import { listObservedMedia } from "../db/events.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

export const campaignsRouter = Router();

// R10-01 fix: every route below reads or writes one tenant's campaign
// config — gated on the bearer session issued at connect time (see
// lib/tenantAuth.ts), matching the session's tenantId against :tenantId.
campaignsRouter.use("/tenants/:tenantId", requireTenantSession);

campaignsRouter.post("/tenants/:tenantId/campaigns", async (req, res) => {
  const { tenantId } = req.params;
  const { name, keywords } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!Array.isArray(keywords) || keywords.length === 0 || !keywords.every((k) => typeof k === "string")) {
    return res.status(400).json({ error: "keywords must be a non-empty array of strings" });
  }

  const campaign = await createCampaign(getPool(), tenantId, name, keywords);
  return res.status(201).json(campaign);
});

campaignsRouter.get("/tenants/:tenantId/campaigns", async (req, res) => {
  const campaigns = await listCampaigns(getPool(), req.params.tenantId);
  return res.status(200).json(campaigns);
});

campaignsRouter.patch("/tenants/:tenantId/campaigns/:campaignId/enabled", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const { enabled } = req.body ?? {};

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }

  const found = await setCampaignEnabled(getPool(), tenantId, campaignId, enabled);
  if (!found) {
    return res.status(404).json({ error: "campaign not found for this tenant" });
  }
  return res.status(200).json({ id: campaignId, enabled });
});

// The creator's entire configuration surface for the Milestone Engine
// (roadmap B8): an ordered plain-language goal list, replaced wholesale
// on each save rather than edited row by row.
campaignsRouter.put("/tenants/:tenantId/campaigns/:campaignId/milestones", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const { milestones } = req.body ?? {};

  if (
    !Array.isArray(milestones) ||
    milestones.length === 0 ||
    !milestones.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        typeof m.goalDescription === "string" &&
        m.goalDescription.trim().length > 0 &&
        (m.captureField === undefined || typeof m.captureField === "string"),
    )
  ) {
    return res.status(400).json({ error: "milestones must be a non-empty array of { goalDescription, captureField? }" });
  }

  const saved = await setCampaignMilestones(getPool(), tenantId, campaignId, milestones);
  return res.status(200).json(saved);
});

campaignsRouter.get("/tenants/:tenantId/campaigns/:campaignId/milestones", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const milestones = await listMilestones(getPool(), tenantId, campaignId);
  return res.status(200).json(milestones);
});

// Backs the campaign editor's post-targeting picker: posts this tenant has
// actually received a comment on, so a creator can pick which post(s) a
// campaign matches without a separate Graph API media-listing call.
campaignsRouter.get("/tenants/:tenantId/observed-media", async (req, res) => {
  const media = await listObservedMedia(getPool(), req.params.tenantId);
  return res.status(200).json(media);
});

campaignsRouter.put("/tenants/:tenantId/campaigns/:campaignId/target-media", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const { targetMediaIds } = req.body ?? {};

  if (!Array.isArray(targetMediaIds) || !targetMediaIds.every((id) => typeof id === "string")) {
    return res.status(400).json({ error: "targetMediaIds must be an array of strings (empty = every post)" });
  }

  const updated = await setCampaignTargetMediaIds(getPool(), tenantId, campaignId, targetMediaIds);
  if (!updated) return res.status(404).json({ error: "campaign not found for this tenant" });
  return res.status(200).json(updated);
});
