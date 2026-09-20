import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { createCampaign, listCampaigns, setCampaignEnabled, setCampaignTargetMediaIds } from "../db/campaigns.js";
import { listMilestones, setCampaignMilestones } from "../db/milestones.js";
import { listKnownMediaForTenant, upsertMediaMetadata } from "../db/mediaMetadata.js";
import { getSoleConnectedAccount, getDecryptedToken } from "../db/tokens.js";
import { fetchMediaMetadata, findMediaByPermalink } from "../lib/instagramMedia.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { Sentry } from "../lib/sentry.js";

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

/**
 * Backs the campaign editor's post-targeting picker: every post this
 * tenant has either received a comment on or explicitly added by URL
 * (listKnownMediaForTenant — no Graph API call for that part). What IS a
 * Graph API call, done here rather than at ingestion time: enriching any
 * entry the cache doesn't have a caption/thumbnail for yet, one lookup per
 * uncached media id, best-effort — a lookup failure (disconnected account,
 * transient Graph error) just leaves that entry showing its bare media id,
 * same as before this existed, rather than failing the whole picker.
 */
campaignsRouter.get("/tenants/:tenantId/observed-media", async (req, res) => {
  const pool = getPool();
  const tenantId = req.params.tenantId;
  let media = await listKnownMediaForTenant(pool, tenantId);

  const uncached = media.filter((m) => !m.permalink);
  if (uncached.length > 0) {
    const account = await getSoleConnectedAccount(pool, tenantId);
    const token = account ? await getDecryptedToken(pool, config.tokenKeyring, tenantId, account.instagramAccountId) : null;
    if (token) {
      for (const entry of uncached) {
        try {
          const metadata = await fetchMediaMetadata(token, entry.mediaId);
          await upsertMediaMetadata(pool, tenantId, metadata);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`Media metadata lookup failed for ${entry.mediaId}:`, err);
          Sentry.captureException(err);
        }
      }
      media = await listKnownMediaForTenant(pool, tenantId); // re-read with whatever just got cached
    }
  }

  return res.status(200).json(media);
});

/**
 * Lets a creator target a post before any comment on it has arrived — a
 * pasted post/Reel URL is resolved against the connected account's own
 * media (there's no direct shortcode-to-media-id lookup), cached, and
 * handed back for the picker to pick up on its next load.
 */
campaignsRouter.post("/tenants/:tenantId/known-media", async (req, res) => {
  const pool = getPool();
  const tenantId = req.params.tenantId;
  const { url } = req.body ?? {};

  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "url is required" });
  }

  const account = await getSoleConnectedAccount(pool, tenantId);
  if (!account) return res.status(400).json({ error: "connect an Instagram account before adding a post" });

  const token = await getDecryptedToken(pool, config.tokenKeyring, tenantId, account.instagramAccountId);
  if (!token) return res.status(400).json({ error: "connect an Instagram account before adding a post" });

  let metadata;
  try {
    metadata = await findMediaByPermalink(token, account.instagramAccountId, url.trim());
  } catch (err) {
    Sentry.captureException(err);
    return res.status(502).json({ error: "could not reach Instagram to resolve that URL — try again shortly" });
  }

  if (!metadata) {
    return res.status(404).json({ error: "no post matching that URL was found on your connected account" });
  }

  await upsertMediaMetadata(pool, tenantId, metadata);
  return res.status(200).json({
    mediaId: metadata.mediaId,
    commentCount: 0,
    lastSeenAt: null,
    caption: metadata.caption,
    mediaType: metadata.mediaType,
    thumbnailUrl: metadata.thumbnailUrl,
    permalink: metadata.permalink,
    postedAt: metadata.postedAt,
  });
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
