import { Router } from "express";
import { getPool } from "../db/pool.js";
import {
  getLead,
  updatePipelineStage,
  assignLeadOwner,
  updateHandoffStatus,
  type PipelineStage,
  type HandoffStatus,
} from "../db/leads.js";
import { getLeadTimelinePage } from "../db/leadTimeline.js";
import { addLeadNote, listLeadNotes } from "../db/leadNotes.js";
import { findOrCreateTag, listTagsForTenant, listTagsForLead, addTagToLead, removeTagFromLead } from "../db/tags.js";
import { createDeal, listDealsForLead, updateDealStage, type DealStage } from "../db/deals.js";
import { listTenantMembers } from "../db/tenantMembers.js";
import { getTopPosts, getTopKeywords } from "../db/analytics.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

export const leadsRouter = Router();

leadsRouter.use("/tenants/:tenantId", requireTenantSession);

// Phase 2A Lead Profiles: everything a Customer 360 view needs about one
// lead beyond what the list already shows.
leadsRouter.get("/tenants/:tenantId/leads/:leadId", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });
  return res.status(200).json(lead);
});

const TIMELINE_DEFAULT_PAGE_SIZE = 50;
const TIMELINE_MAX_PAGE_SIZE = 200;

// Phase 2A Lead Timeline / Lead Activity History. Cursor-paginated
// (`before`, an ISO timestamp) rather than returning the whole
// conversation: a long-running lead's full history was slow to fetch and
// render on every load. Omit `before` for the most recent page.
leadsRouter.get("/tenants/:tenantId/leads/:leadId/timeline", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, TIMELINE_MAX_PAGE_SIZE) : TIMELINE_DEFAULT_PAGE_SIZE;

  let before: Date | undefined;
  if (typeof req.query.before === "string") {
    const parsed = new Date(req.query.before);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "before must be a valid ISO timestamp" });
    before = parsed;
  }

  const page = await getLeadTimelinePage(getPool(), tenantId, leadId, limit, before);
  return res.status(200).json(page);
});

const VALID_PIPELINE_STAGES: PipelineStage[] = ["new", "contacted", "qualified", "meeting_scheduled", "won", "lost"];

// Phase 2A Pipeline Management / Lead Ownership & Assignment: a single
// PATCH covers both, since a dashboard's lead detail panel typically
// changes one or the other from the same form, never neither.
leadsRouter.patch("/tenants/:tenantId/leads/:leadId", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const { pipelineStage, ownerUserId } = req.body ?? {};
  const actorUserId = req.tenantSession!.userId;

  if (pipelineStage === undefined && ownerUserId === undefined) {
    return res.status(400).json({ error: "provide pipelineStage and/or ownerUserId" });
  }
  if (pipelineStage !== undefined && !VALID_PIPELINE_STAGES.includes(pipelineStage)) {
    return res.status(400).json({ error: `pipelineStage must be one of ${VALID_PIPELINE_STAGES.join(", ")}` });
  }
  if (ownerUserId !== undefined && ownerUserId !== null && typeof ownerUserId !== "string") {
    return res.status(400).json({ error: "ownerUserId must be a string or null" });
  }

  let lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });

  if (pipelineStage !== undefined) {
    lead = await updatePipelineStage(getPool(), { tenantId, leadId, stage: pipelineStage, actorUserId });
  }
  if (ownerUserId !== undefined) {
    // Assignment is restricted to actual tenant members — an arbitrary
    // userId would otherwise silently create an unresolvable "owner" no
    // dropdown anywhere could ever have offered.
    let ownerEmail: string | null = null;
    if (ownerUserId !== null) {
      const members = await listTenantMembers(getPool(), tenantId);
      const member = members.find((m) => m.userId === ownerUserId);
      if (!member) return res.status(400).json({ error: "ownerUserId is not a member of this tenant" });
      ownerEmail = member.email;
    }
    lead = await assignLeadOwner(getPool(), { tenantId, leadId, ownerUserId, ownerEmail, actorUserId });
  }

  return res.status(200).json(lead);
});

const VALID_HANDOFF_ACTIONS = ["request", "takeover", "release"] as const;
type HandoffAction = (typeof VALID_HANDOFF_ACTIONS)[number];
const HANDOFF_ACTION_TO_STATUS: Record<HandoffAction, HandoffStatus> = {
  request: "requested", // Agent Escalation, triggered manually from the dashboard
  takeover: "human", // Live Agent Takeover — pauses the Reply Engine for this lead
  release: "ai", // Conversation Transfer back to the bot
};

// Phase 2A Human Handoff: Agent Escalation / Live Agent Takeover /
// Conversation Transfer, all as one action-based endpoint rather than
// three, since they're really three values of the same field.
leadsRouter.post("/tenants/:tenantId/leads/:leadId/handoff", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const { action } = req.body ?? {};
  if (!VALID_HANDOFF_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${VALID_HANDOFF_ACTIONS.join(", ")}` });
  }

  const lead = await updateHandoffStatus(getPool(), {
    tenantId,
    leadId,
    status: HANDOFF_ACTION_TO_STATUS[action as HandoffAction],
    actorUserId: req.tenantSession!.userId,
  });
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });
  return res.status(200).json(lead);
});

// Phase 2A Lead Notes / Internal Comments.
leadsRouter.get("/tenants/:tenantId/leads/:leadId/notes", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const notes = await listLeadNotes(getPool(), tenantId, leadId);
  return res.status(200).json(notes);
});

leadsRouter.post("/tenants/:tenantId/leads/:leadId/notes", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const { body } = req.body ?? {};
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "body is required" });
  }

  const lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });

  const note = await addLeadNote(getPool(), {
    tenantId,
    leadId,
    authorUserId: req.tenantSession!.userId,
    body: body.trim(),
  });
  return res.status(201).json(note);
});

// Phase 2A Tagging System.
leadsRouter.get("/tenants/:tenantId/tags", async (req, res) => {
  const tags = await listTagsForTenant(getPool(), req.params.tenantId);
  return res.status(200).json(tags);
});

leadsRouter.get("/tenants/:tenantId/leads/:leadId/tags", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const tags = await listTagsForLead(getPool(), tenantId, leadId);
  return res.status(200).json(tags);
});

leadsRouter.post("/tenants/:tenantId/leads/:leadId/tags", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });

  const tag = await findOrCreateTag(getPool(), tenantId, name.trim());
  await addTagToLead(getPool(), {
    tenantId,
    leadId,
    tagId: tag.id,
    tagName: tag.name,
    actorUserId: req.tenantSession!.userId,
  });
  return res.status(201).json(tag);
});

leadsRouter.delete("/tenants/:tenantId/leads/:leadId/tags/:tagId", async (req, res) => {
  const { tenantId, leadId, tagId } = req.params;
  const tags = await listTagsForLead(getPool(), tenantId, leadId);
  const tag = tags.find((t) => t.tagId === tagId);
  if (!tag) return res.status(404).json({ error: "tag not found on this lead" });

  await removeTagFromLead(getPool(), { tenantId, leadId, tagId, tagName: tag.name, actorUserId: req.tenantSession!.userId });
  return res.status(204).send();
});

// Phase 2A Data Model Amendment: deals, schema now / UI later — a minimal
// CRUD surface so the schema isn't entirely dark before Phase 4 builds
// real revenue reporting on it.
leadsRouter.get("/tenants/:tenantId/leads/:leadId/deals", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const deals = await listDealsForLead(getPool(), tenantId, leadId);
  return res.status(200).json(deals);
});

leadsRouter.post("/tenants/:tenantId/leads/:leadId/deals", async (req, res) => {
  const { tenantId, leadId } = req.params;
  const { value, currency } = req.body ?? {};
  if (value !== undefined && value !== null && typeof value !== "number") {
    return res.status(400).json({ error: "value must be a number or null" });
  }

  const lead = await getLead(getPool(), tenantId, leadId);
  if (!lead) return res.status(404).json({ error: "lead not found for this tenant" });
  if (!lead.customerId) {
    // Can't happen for any lead created after the Phase 1 migration's
    // backfill — guarded anyway since this is the first place customerId
    // being null would actually break something, rather than silently
    // going unused.
    return res.status(409).json({ error: "lead has no customer record yet" });
  }

  const deal = await createDeal(getPool(), {
    tenantId,
    customerId: lead.customerId,
    leadId,
    value: value ?? null,
    currency: typeof currency === "string" ? currency : undefined,
    ownerUserId: lead.ownerUserId,
    actorUserId: req.tenantSession!.userId,
  });
  return res.status(201).json(deal);
});

const VALID_DEAL_STAGES: DealStage[] = ["open", "won", "lost"];

leadsRouter.patch("/tenants/:tenantId/deals/:dealId", async (req, res) => {
  const { tenantId, dealId } = req.params;
  const { stage } = req.body ?? {};
  if (!VALID_DEAL_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of ${VALID_DEAL_STAGES.join(", ")}` });
  }

  const deal = await updateDealStage(getPool(), { tenantId, dealId, stage, actorUserId: req.tenantSession!.userId });
  if (!deal) return res.status(404).json({ error: "deal not found for this tenant" });
  return res.status(200).json(deal);
});

// Backs the Lead Ownership assignment dropdown.
leadsRouter.get("/tenants/:tenantId/members", async (req, res) => {
  const members = await listTenantMembers(getPool(), req.params.tenantId);
  return res.status(200).json(members);
});

// Phase 2A "Carried from Phase 1": Top Performing Posts / Top Trigger Keywords.
leadsRouter.get("/tenants/:tenantId/analytics/top-posts", async (req, res) => {
  const posts = await getTopPosts(getPool(), req.params.tenantId);
  return res.status(200).json(posts);
});

leadsRouter.get("/tenants/:tenantId/analytics/top-keywords", async (req, res) => {
  const keywords = await getTopKeywords(getPool(), req.params.tenantId);
  return res.status(200).json(keywords);
});
