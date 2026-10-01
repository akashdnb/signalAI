import { Router } from "express";
import type { PoolClient } from "pg";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  setCampaignEnabled,
  setCampaignTargetMediaIds,
  setCampaignReplyTemplates,
} from "../db/campaigns.js";
import { listMilestones, listMilestonesWithClient, setCampaignMilestonesWithClient } from "../db/milestones.js";
import { getBuilderGraph, getBuilderGraphWithClient, saveBuilderGraph, saveBuilderGraphWithClient, synchronizeMilestoneGraph, type JourneyNode, type JourneyEdge } from "../db/journeyGraph.js";
import { listKnownMediaForTenant, upsertMediaMetadata } from "../db/mediaMetadata.js";
import { validateJourneyGraph } from "../domain/journey/validateJourney.js";
import { createPublishedJourneyWithClient, getLatestPublishedJourneyWithClient } from "../db/journeyVersions.js";

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

campaignsRouter.get("/tenants/:tenantId/campaigns/:campaignId", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const campaign = await getCampaign(getPool(), tenantId, campaignId);

  if (!campaign) {
    return res.status(404).json({ error: "campaign not found for this tenant" });
  }

  return res.status(200).json(campaign);
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
  const { milestones, oldIndexToNewIndex: requestedIndexMap } = req.body ?? {};

  if (
    !Array.isArray(milestones) ||
    milestones.length === 0 ||
    !milestones.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        typeof m.goalDescription === "string" &&
        m.goalDescription.trim().length > 0 &&
        (m.captureFields === undefined ||
          (Array.isArray(m.captureFields) && m.captureFields.every((f: unknown) => typeof f === "string"))),
    )
  ) {
    return res
      .status(400)
      .json({ error: "milestones must be a non-empty array of { goalDescription, captureFields?: string[] }" });
  }

  const pool = getPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const previousMilestones = await listMilestonesWithClient(client, tenantId, campaignId);
    let oldIndexToNewIndex: Array<number | null>;
    if (requestedIndexMap === undefined) {
      oldIndexToNewIndex = previousMilestones.map((_, index) =>
        index < milestones.length ? index : null,
      );
    } else {
      if (
        !Array.isArray(requestedIndexMap) ||
        requestedIndexMap.length !== previousMilestones.length ||
        !requestedIndexMap.every((index) =>
          index === null ||
          (Number.isInteger(index) && index >= 0 && index < milestones.length),
        ) ||
        new Set(requestedIndexMap.filter((index): index is number => index !== null)).size !==
          requestedIndexMap.filter((index: unknown) => index !== null).length
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "oldIndexToNewIndex must map each previous milestone to a unique new index or null" });
      }
      oldIndexToNewIndex = requestedIndexMap as Array<number | null>;
    }

    const graph = await getBuilderGraphWithClient(client, tenantId, campaignId);
    if (!graph) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "campaign not found for this tenant" });
    }

    const saved = await setCampaignMilestonesWithClient(
      client,
      tenantId,
      campaignId,
      milestones,
    );
    const synchronized = synchronizeMilestoneGraph(
      graph,
      previousMilestones,
      saved,
      oldIndexToNewIndex,
    );
    const graphSave = await saveBuilderGraphWithClient(
      client,
      tenantId,
      campaignId,
      graph.version,
      synchronized.nodes,
      synchronized.edges,
    );
    if (graphSave.status === "conflict") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "journey graph changed elsewhere; reload the builder",
        currentVersion: graphSave.currentVersion,
      });
    }
    if (graphSave.status !== "ok") {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "could not synchronize journey graph" });
    }

    await client.query("COMMIT");
    return res.status(200).json(saved);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});


/**
 * Publish the current editable journey as an immutable snapshot.
 *
 * The draft is still represented by journey_nodes/journey_edges.
 * Publishing copies the complete graph into campaign_journey_versions.
 *
 * expectedBuilderVersion protects against publishing a graph that the
 * caller loaded before another editor changed it.
 */
campaignsRouter.post(
  "/tenants/:tenantId/campaigns/:campaignId/journey/publish",
  async (req, res) => {
    const { tenantId, campaignId } = req.params;
    const { expectedBuilderVersion } = req.body ?? {};

    if (
      typeof expectedBuilderVersion !== "number" ||
      !Number.isInteger(expectedBuilderVersion)
    ) {
      return res.status(400).json({
        error: "expectedBuilderVersion must be an integer",
      });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
       * Lock the campaign row first. This serializes publication against
       * builder saves, because saveBuilderGraphWithClient also locks this
       * same campaign row before checking builder_version.
       */
      const campaignResult = await client.query<{
        builder_version: number;
      }>(
        `select builder_version
           from campaigns
          where id = $1
            and tenant_id = $2
          for update`,
        [campaignId, tenantId],
      );

      const campaign = campaignResult.rows[0];

      if (!campaign) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: "campaign not found for this tenant",
        });
      }

      if (campaign.builder_version !== expectedBuilderVersion) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "this journey changed elsewhere — reload before publishing",
          currentBuilderVersion: campaign.builder_version,
        });
      }

      const graph = await getBuilderGraphWithClient(
        client,
        tenantId,
        campaignId,
      );

      if (!graph) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: "campaign not found for this tenant",
        });
      }

      const milestones = await listMilestonesWithClient(
        client,
        tenantId,
        campaignId,
      );

      const validation = validateJourneyGraph(graph, milestones);

      if (!validation.valid) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "journey validation failed",
          details: validation.errors,
        });
      }

      const published = await createPublishedJourneyWithClient(
        client,
        tenantId,
        campaignId,
        graph,
      );

      await client.query("COMMIT");

      return res.status(200).json(published);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
);

/**
 * Read the latest immutable published journey.
 *
 * This endpoint is intentionally separate from /builder:
 *
 * /builder            -> mutable draft
 * /journey/published  -> immutable runtime snapshot
 */
campaignsRouter.get(
  "/tenants/:tenantId/campaigns/:campaignId/journey/published",
  async (req, res) => {
    const { tenantId, campaignId } = req.params;

    const client = await getPool().connect();

    try {
      const published = await getLatestPublishedJourneyWithClient(
        client,
        tenantId,
        campaignId,
      );

      return res.status(200).json(published);
    } finally {
      client.release();
    }
  },
);

campaignsRouter.get("/tenants/:tenantId/campaigns/:campaignId/milestones", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const milestones = await listMilestones(getPool(), tenantId, campaignId);
  return res.status(200).json(milestones);
});

function isValidPosition(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { x: unknown }).x === "number" &&
    typeof (value as { y: unknown }).y === "number"
  );
}

function isValidNode(value: unknown): value is JourneyNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === "string" &&
    node.id.length > 0 &&
    typeof node.type === "string" &&
    node.type.length > 0 &&
    isValidPosition(node.position) &&
    typeof node.data === "object" &&
    node.data !== null &&
    (node.parentGroupId === null || typeof node.parentGroupId === "string") &&
    typeof node.collapsed === "boolean"
  );
}

function isValidEdge(value: unknown): value is JourneyEdge {
  if (typeof value !== "object" || value === null) return false;
  const edge = value as Record<string, unknown>;
  return (
    typeof edge.id === "string" &&
    edge.id.length > 0 &&
    typeof edge.sourceNodeId === "string" &&
    typeof edge.targetNodeId === "string" &&
    (edge.label === null || typeof edge.label === "string") &&
    (edge.condition === null || (typeof edge.condition === "object" && edge.condition !== null))
  );
}

/**
 * Advanced Automation Builder (graph data model): the whole visual journey
 * — nodes and edges — read and written as one atomic unit. GET synthesizes
 * a default pipeline graph on the fly for any campaign that hasn't saved a
 * real one yet (see getBuilderGraph), so every campaign — including ones
 * created before this endpoint existed — has something to render.
 */
campaignsRouter.get("/tenants/:tenantId/campaigns/:campaignId/builder", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const graph = await getBuilderGraph(getPool(), tenantId, campaignId);
  if (!graph) return res.status(404).json({ error: "campaign not found for this tenant" });
  return res.status(200).json(graph);
});

/**
 * Atomic save, gated on `expectedVersion` (roadmap "Atomic Save" /
 * "Version Conflict"): a save based on a stale read is rejected with 409
 * rather than silently overwriting whatever another editor saved in the
 * meantime. `campaigns.builder_version` is the source of truth for the
 * current version; the response's `currentVersion` is what the caller
 * should re-read from before trying again.
 */
campaignsRouter.put("/tenants/:tenantId/campaigns/:campaignId/builder", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const { expectedVersion, nodes, edges } = req.body ?? {};

  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return res.status(400).json({ error: "expectedVersion must be an integer" });
  }
  if (!Array.isArray(nodes) || !nodes.every(isValidNode)) {
    return res
      .status(400)
      .json({ error: "nodes must be an array of { id, type, position: {x,y}, data, parentGroupId, collapsed }" });
  }
  if (!Array.isArray(edges) || !edges.every(isValidEdge)) {
    return res
      .status(400)
      .json({ error: "edges must be an array of { id, sourceNodeId, targetNodeId, label, condition }" });
  }

  const result = await saveBuilderGraph(getPool(), tenantId, campaignId, expectedVersion, nodes, edges);
  if (result.status === "not_found") {
    return res.status(404).json({ error: "campaign not found for this tenant" });
  }
  if (result.status === "conflict") {
    return res
      .status(409)
      .json({ error: "this journey changed elsewhere — reload before saving again", currentVersion: result.currentVersion });
  }
  if (result.status === "invalid") {
    return res.status(400).json({ error: "invalid graph", details: result.errors });
  }
  return res.status(200).json(result.graph);
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

// Phase 2A "Multiple DM Variations".
campaignsRouter.put("/tenants/:tenantId/campaigns/:campaignId/reply-templates", async (req, res) => {
  const { tenantId, campaignId } = req.params;
  const { replyTemplates } = req.body ?? {};

  if (!Array.isArray(replyTemplates) || !replyTemplates.every((t) => typeof t === "string" && t.trim())) {
    return res.status(400).json({ error: "replyTemplates must be an array of non-empty strings (empty array = use defaultReplyTemplate)" });
  }

  const updated = await setCampaignReplyTemplates(getPool(), tenantId, campaignId, replyTemplates);
  if (!updated) return res.status(404).json({ error: "campaign not found for this tenant" });
  return res.status(200).json(updated);
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
