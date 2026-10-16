import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { bumpUserSessionVersion } from "../../db/users.js";
import { upsertToken, markTokenError } from "../../db/tokens.js";
import { createCampaign } from "../../db/campaigns.js";
import { setCampaignMilestones, recordMilestoneAdvancement } from "../../db/milestones.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { tryReserveSend } from "../../db/accountSends.js";
import { recordDeadLetterEvent } from "../../db/deadLetterEvents.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant, sessionHeaderFor } from "../../__tests__/helpers/auth.js";
import { upsertGuardrailsConfig } from "../../db/guardrailsConfig.js";
import type { LLMProvider } from "../../llm/provider.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";

const SESSION_SECRET = "test-session-secret";

const mockQueryRelevantChunks = vi.fn();
vi.mock("../../db/knowledgeBase.js", () => ({
  queryRelevantChunks: (...args: unknown[]) => mockQueryRelevantChunks(...args),
}));

function fakeEmbeddingProvider(): EmbeddingProvider {
  return { name: "fake", embed: vi.fn(async () => ({ vectors: [[1, 0]] })) };
}

describe("dashboard routes (BUI backend surface)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table account_sends, dead_letter_events, milestone_advancements");
    mockQueryRelevantChunks.mockReset().mockResolvedValue([]);
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /tenants/:id returns the tenant summary for a real tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const found = await request(app).get(`/tenants/${tenant.id}`).set(authHeader);
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: tenant.id, name: "creator-a", billingStatus: "none" });
  });

  // requireTenantSession rejects a session for a tenant that doesn't
  // exist (no membership row can exist for it) before the route's own
  // 404 check ever runs.
  it("rejects a session for an unknown tenant with 403", async () => {
    const pool = getPool();
    const { authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const missing = await request(app).get(`/tenants/00000000-0000-0000-0000-000000000000`).set(authHeader);
    expect(missing.status).toBe(403);
  });

  it("GET /tenants/:id/account reports not connected, then healthy, then error", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const keyring = new Map([["v1", randomBytes(32)]]);
    const app = createApp();

    const before = await request(app).get(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(before.body).toEqual({ connected: false });

    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "t" });
    const healthy = await request(app).get(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(healthy.body).toMatchObject({ connected: true, instagramAccountId: "acct-1", status: "healthy" });

    await markTokenError(pool, tenant.id, "acct-1", "refresh failed");
    const errored = await request(app).get(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(errored.body).toMatchObject({ connected: true, status: "error", lastError: "refresh failed" });
  });

  it("DELETE /tenants/:id/account disconnects Instagram and is idempotent", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const keyring = new Map([["v1", randomBytes(32)]]);
    const app = createApp();

    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "t" });

    const disconnected = await request(app).delete(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(disconnected.status).toBe(200);
    expect(disconnected.body).toEqual({ connected: false });

    const after = await request(app).get(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(after.body).toEqual({ connected: false });

    // Disconnecting twice is not an error — the caller's intent is already satisfied.
    const again = await request(app).delete(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(again.status).toBe(200);
  });

  it("DELETE /tenants/:id/account rejects a session for another tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const keyring = new Map([["v1", randomBytes(32)]]);
    const app = createApp();

    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "t" });

    const res = await request(app).delete(`/tenants/${tenant.id}/account`).set(otherAuthHeader);
    expect(res.status).toBe(403);

    const still = await request(app).get(`/tenants/${tenant.id}/account`).set(authHeader);
    expect(still.body).toMatchObject({ connected: true });
  });

  it("GET /tenants/:id/leads lists leads with their latest username, most recent first", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, username: "real_handle" });

    const res = await request(app).get(`/tenants/${tenant.id}/leads`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: lead.id, username: "real_handle", lastEventType: "comment" });
  });

  // A DM (or a shared Reel, which also arrives as a `message` event) never
  // carries a username in Meta's webhook payload — distinguishing it from
  // a comment-triggered lead in the dashboard is the whole point of
  // lastEventType.
  it("GET /tenants/:id/leads reports lastEventType and leaves username null for a DM-only lead", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-dm",
      eventType: "message",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, dmText: "hi" });

    const res = await request(app).get(`/tenants/${tenant.id}/leads`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: lead.id, username: null, lastEventType: "message" });
  });

  it("GET /tenants/:id/leads reports lastMessagePreview from the most recent event's PII, and unread=true with no last_read_at yet", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "message",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, dmText: "What's the price?" });
    await pool.query(`update leads set last_inbound_at = now() where id = $1`, [lead.id]);

    const res = await request(app).get(`/tenants/${tenant.id}/leads`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: lead.id, lastMessagePreview: "What's the price?", unread: true });
  });

  it("GET /tenants/:id/leads: unread flips false after POST .../read, and unread=true filters it back out", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await pool.query(`update leads set last_inbound_at = now() where id = $1`, [lead.id]);

    const before = await request(app).get(`/tenants/${tenant.id}/leads?unread=true`).set(authHeader);
    expect(before.body).toHaveLength(1);

    const markRead = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/read`).set(authHeader);
    expect(markRead.status).toBe(204);

    const all = await request(app).get(`/tenants/${tenant.id}/leads`).set(authHeader);
    expect(all.body[0]).toMatchObject({ unread: false });

    const after = await request(app).get(`/tenants/${tenant.id}/leads?unread=true`).set(authHeader);
    expect(after.body).toHaveLength(0);
  });

  it("GET /tenants/:id/leads filters by handoffStatus, and rejects an invalid one", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");
    await request(app).post(`/tenants/${tenant.id}/leads/${leadB.id}/handoff`).set(authHeader).send({ action: "takeover" });

    const aiOnly = await request(app).get(`/tenants/${tenant.id}/leads?handoffStatus=ai`).set(authHeader);
    expect(aiOnly.body.map((l: { id: string }) => l.id)).toEqual([leadA.id]);

    const humanOnly = await request(app).get(`/tenants/${tenant.id}/leads?handoffStatus=human`).set(authHeader);
    expect(humanOnly.body.map((l: { id: string }) => l.id)).toEqual([leadB.id]);

    const invalid = await request(app).get(`/tenants/${tenant.id}/leads?handoffStatus=bogus`).set(authHeader);
    expect(invalid.status).toBe(400);
  });

  it("GET /tenants/:id/analytics reports the four numbers sourced from their durable tables", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await tryReserveSend(pool, tenant.id, "acct-1", 750);
    await recordDeadLetterEvent(pool, {
      queueName: "lead-events",
      sourceJobId: "job-1",
      jobData: { tenantId: tenant.id, leadId: lead.id },
      failureOutput: null,
    });

    const res = await request(app).get(`/tenants/${tenant.id}/analytics`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ commentsReceived: 1, dmsSent: 1, dmFailures: 1, uniqueLeads: 1 });
  });

  it("GET /tenants/:id/analytics/funnel reports exact current stage counts alongside cumulative progression counts", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-b");
    await request(app).patch(`/tenants/${tenant.id}/leads/${leadA.id}`).set(authHeader).send({ pipelineStage: "won" });
    await request(app).patch(`/tenants/${tenant.id}/leads/${leadB.id}`).set(authHeader).send({ pipelineStage: "qualified" });

    const res = await request(app).get(`/tenants/${tenant.id}/analytics/funnel`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.stages.find((s: { key: string }) => s.key === "leads")).toMatchObject({ count: 2 });
    expect(res.body.stages.find((s: { key: string }) => s.key === "qualified")).toMatchObject({ count: 2 });
    expect(res.body.stages.find((s: { key: string }) => s.key === "won")).toMatchObject({ count: 1 });
    expect(res.body.stageCounts).toEqual({
      new: 0,
      contacted: 0,
      qualified: 1,
      meeting_scheduled: 0,
      won: 1,
      lost: 0,
    });
    expect(res.body.unmappedLeadCount).toBe(0);
    expect(res.body.stages.find((s: { key: string }) => s.key === "comments")?.label).toBe("Comments received");
    expect(res.body.stages.find((s: { key: string }) => s.key === "dms")?.label).toBe("DMs reserved");
    expect(res.body.openWithNoOutcome).toBe(1); // leadB (qualified) — leadA is won
  });

  it("GET /tenants/:id/analytics/revenue sums won deal value by currency", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const deal = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/deals`).set(authHeader).send({ value: 50000, currency: "INR" });
    await request(app).patch(`/tenants/${tenant.id}/deals/${deal.body.id}`).set(authHeader).send({ stage: "won" });

    const res = await request(app).get(`/tenants/${tenant.id}/analytics/revenue`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ currency: "INR", total: 50000 }]);
  });

  it("GET /tenants/:id/analytics/timeseries zero-fills 30 days and counts today's comment", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });

    const res = await request(app).get(`/tenants/${tenant.id}/analytics/timeseries`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
    const today = res.body.at(-1);
    expect(today).toMatchObject({ comments: 1, dms: 0 });
    expect(res.body[0]).toMatchObject({ comments: 0, dms: 0 });
  });

  it("GET /tenants/:id/campaigns/:id/dropoff reports per-milestone advancement counts in order", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const milestones = await setCampaignMilestones(pool, tenant.id, campaign.id, [
      { goalDescription: "capture email" },
      { goalDescription: "book a call" },
    ]);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await recordMilestoneAdvancement(pool, tenant.id, lead.id, campaign.id, milestones[0]!.id);

    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/campaigns/${campaign.id}/dropoff`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { milestoneId: milestones[0]!.id, ordinal: 0, goalDescription: "capture email", advancedCount: 1 },
      { milestoneId: milestones[1]!.id, ordinal: 1, goalDescription: "book a call", advancedCount: 0 },
    ]);
  });

  it("PATCH reply-config updates replyMode/ctaLink/defaultReplyTemplate, 403s for a tenant the caller isn't a member of", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: otherTenant, authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const res = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ replyMode: "ai_generated", ctaLink: "https://example.com/offer" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ replyMode: "ai_generated", ctaLink: "https://example.com/offer" });

    // creator-b's own session against creator-a's campaign path: rejected
    // at the membership check, before the campaign lookup ever runs.
    const wrongTenant = await request(app)
      .patch(`/tenants/${otherTenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(otherAuthHeader)
      .send({ replyMode: "rule_based" });
    expect(wrongTenant.status).toBe(404); // otherTenant is real and a member, but the campaign isn't theirs
  });

  it("PATCH reply-config rejects an invalid replyMode", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const res = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ replyMode: "not-a-real-mode" });
    expect(res.status).toBe(400);
  });

  it("PATCH reply-config updates replyChannel and rejects an invalid one", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    expect(campaign.replyChannel).toBe("dm"); // default preserves today's behaviour
    const app = createApp();

    const invalid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ replyChannel: "carrier-pigeon" });
    expect(invalid.status).toBe(400);

    const both = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ replyChannel: "both" });
    expect(both.status).toBe(200);
    expect(both.body.replyChannel).toBe("both");
  });

  it("PATCH reply-config updates triggerSource and rejects an invalid one", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    expect(campaign.triggerSource).toBe("comment"); // default preserves today's behaviour
    const app = createApp();

    const invalid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ triggerSource: "smoke-signal" });
    expect(invalid.status).toBe(400);

    const both = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ triggerSource: "both" });
    expect(both.status).toBe(200);
    expect(both.body.triggerSource).toBe("both");
  });

  it("new campaigns default to tone=professional_and_friendly, language=auto, useKnowledgeBase=true", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    expect(campaign).toMatchObject({ tone: "professional_and_friendly", language: "auto", useKnowledgeBase: true });
  });

  it("PATCH reply-config updates tone and rejects an invalid one", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const invalid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ tone: "sarcastic" });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ tone: "casual" });
    expect(valid.status).toBe(200);
    expect(valid.body.tone).toBe("casual");
  });

  it("PATCH reply-config updates language and rejects an invalid one", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const invalid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ language: "fr" });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ language: "hi" });
    expect(valid.status).toBe(200);
    expect(valid.body.language).toBe("hi");
  });

  it("PATCH reply-config updates useKnowledgeBase, including explicitly setting it back to false", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const invalid = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ useKnowledgeBase: "yes" });
    expect(invalid.status).toBe(400);

    const off = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ useKnowledgeBase: false });
    expect(off.status).toBe(200);
    expect(off.body.useKnowledgeBase).toBe(false);

    // The "was it sent at all" boolean-flag trick: a PATCH that omits
    // useKnowledgeBase entirely must leave the false value alone, not
    // coalesce it back to some default.
    const untouched = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ replyMode: "ai_generated" });
    expect(untouched.body.useKnowledgeBase).toBe(false);

    const on = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${campaign.id}/reply-config`)
      .set(authHeader)
      .send({ useKnowledgeBase: true });
    expect(on.status).toBe(200);
    expect(on.body.useKnowledgeBase).toBe(true);
  });

  it("POST preview returns both a rule-based and an AI-generated sample reply, regardless of the campaign's current mode", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], {
      defaultReplyTemplate: "Hi {{username}}, thanks for {{keyword}}!",
    });

    const mockProvider: LLMProvider = { name: "mock", generateReply: vi.fn().mockResolvedValue({ text: "Here's the info!" }) };
    const app = createApp({ llmProvider: mockProvider });

    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
      .set(authHeader)
      .send({ sampleText: "send the LINK please", sampleUsername: "curious_customer" });

    expect(res.status).toBe(200);
    expect(res.body.ruleBased.text).toContain("curious_customer");
    expect(res.body.aiGenerated.text).toBe("Here's the info!");
  });

  it("POST preview falls back to a rule-based sample for the AI slot when no provider is configured", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp(); // no llmProvider passed — default unconfigured stub

    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
      .set(authHeader)
      .send({ sampleText: "send the LINK please" });

    expect(res.status).toBe(200);
    expect(res.body.aiGenerated.fellBackReason).toContain("provider error");
  });

  // Phase 2C: previously this route called generateReply with no `rag`
  // argument at all, so a preview could show a clean AI reply while the
  // real leadEventReplyHandler.ts path silently routed to the
  // Grounded-Answer-Only Fallback or an escalation trigger — a mismatch a
  // creator would only discover by testing the real thing.
  describe("Phase 2C RAG integration", () => {
    it("surfaces requiresHumanHandoff in the preview when the tenant has a knowledge base but nothing matches well enough", async () => {
      mockQueryRelevantChunks.mockResolvedValue([
        { content: "unrelated content", document_id: "doc-1", similarity: 0.1 },
      ]);
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

      const mockProvider: LLMProvider = { name: "mock", generateReply: vi.fn() };
      const app = createApp({ llmProvider: mockProvider, embeddingProvider: fakeEmbeddingProvider() });

      const res = await request(app)
        .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
        .set(authHeader)
        .send({ sampleText: "some off-topic question" });

      expect(res.status).toBe(200);
      expect(res.body.aiGenerated.requiresHumanHandoff).toBe(true);
      expect(mockProvider.generateReply).not.toHaveBeenCalled();
    });

    it("injects retrieved knowledge base content into the AI preview when retrieval matches well", async () => {
      mockQueryRelevantChunks.mockResolvedValue([
        { content: "Our refund window is 30 days.", document_id: "doc-1", similarity: 0.95 },
      ]);
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

      const generateReplyMock = vi.fn().mockResolvedValue({ text: "It's 30 days." });
      const mockProvider: LLMProvider = { name: "mock", generateReply: generateReplyMock };
      const app = createApp({ llmProvider: mockProvider, embeddingProvider: fakeEmbeddingProvider() });

      const res = await request(app)
        .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
        .set(authHeader)
        .send({ sampleText: "what's your refund policy?" });

      expect(res.status).toBe(200);
      expect(res.body.aiGenerated.text).toBe("It's 30 days.");
      const call = generateReplyMock.mock.calls[0]![0];
      expect(call.systemPrompt).toContain("Our refund window is 30 days.");
    });

    it("surfaces requiresHumanHandoff on a tenant-configured escalation trigger, before any provider call", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
      await upsertGuardrailsConfig(pool, {
        tenantId: tenant.id,
        brandVoice: null,
        forbiddenTopics: [],
        escalationTriggers: ["talk to a lawyer"],
      });

      const mockProvider: LLMProvider = { name: "mock", generateReply: vi.fn() };
      const app = createApp({ llmProvider: mockProvider, embeddingProvider: fakeEmbeddingProvider() });

      const res = await request(app)
        .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
        .set(authHeader)
        .send({ sampleText: "I want to talk to a lawyer about this" });

      expect(res.status).toBe(200);
      expect(res.body.aiGenerated.requiresHumanHandoff).toBe(true);
      expect(mockProvider.generateReply).not.toHaveBeenCalled();
    });

    it("still works with no embeddingProvider configured — behaves exactly as before Phase 2C", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

      const mockProvider: LLMProvider = { name: "mock", generateReply: vi.fn().mockResolvedValue({ text: "Sure!" }) };
      const app = createApp({ llmProvider: mockProvider }); // no embeddingProvider

      const res = await request(app)
        .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
        .set(authHeader)
        .send({ sampleText: "send the LINK please" });

      expect(res.status).toBe(200);
      expect(res.body.aiGenerated.text).toBe("Sure!");
      expect(res.body.aiGenerated.requiresHumanHandoff).toBeUndefined();
      expect(mockQueryRelevantChunks).not.toHaveBeenCalled();
    });
  });

  it("POST preview rejects an empty sampleText", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const app = createApp();

    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/${campaign.id}/preview`)
      .set(authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  // R10-01 regression: no route here should be reachable without a
  // session for the exact tenant in the URL.
  it("rejects every route with no session, and with a session for a different tenant", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const noSession = await request(app).get(`/tenants/${tenant.id}/leads`);
    expect(noSession.status).toBe(401);

    const wrongTenantSession = await request(app).get(`/tenants/${tenant.id}/leads`).set(otherAuthHeader);
    expect(wrongTenantSession.status).toBe(403);
  });

  // Identity Refactor: revocation now lives on the USER, not the tenant —
  // a session issued before bumpUserSessionVersion must stop working
  // immediately, without waiting for its 30-day expiry or rotating
  // SESSION_SECRET (which would sign out every other user too).
  it("rejects a session issued before the user's session_version was bumped (revocation)", async () => {
    const pool = getPool();
    const { tenant, user, authHeader: staleHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const beforeBump = await request(app).get(`/tenants/${tenant.id}/leads`).set(staleHeader);
    expect(beforeBump.status).toBe(200);

    await bumpUserSessionVersion(pool, user.id);

    const afterBump = await request(app).get(`/tenants/${tenant.id}/leads`).set(staleHeader);
    expect(afterBump.status).toBe(401);

    // A freshly-minted session (post-bump version) works again.
    const freshHeader = await sessionHeaderFor(pool, SESSION_SECRET, user.id);
    const withFreshSession = await request(app).get(`/tenants/${tenant.id}/leads`).set(freshHeader);
    expect(withFreshSession.status).toBe(200);
  });
  it("validates account filters against the active tenant before returning leads", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const keyring = new Map([["v1", randomBytes(32)]]);
    const app = createApp();

    await upsertToken(pool, keyring, { tenantId: tenantA.id, instagramAccountId: "acct-a", accessToken: "unused-a" });
    await upsertToken(pool, keyring, { tenantId: tenantA.id, instagramAccountId: "acct-b", accessToken: "unused-b" });
    await upsertToken(pool, keyring, { tenantId: tenantB.id, instagramAccountId: "acct-other-tenant", accessToken: "unused-c" });

    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "shared-user", "acct-a");
    await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "shared-user", "acct-b");
    const leadOtherTenant = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "other-user", "acct-other-tenant");

    const accountRows = await pool.query<{ id: string; instagram_account_id: string }>(
      `select id, instagram_account_id from meta_tokens where tenant_id = $1 order by instagram_account_id`,
      [tenantA.id],
    );
    const rowA = accountRows.rows.find((row) => row.instagram_account_id === "acct-a")!;
    const rowB = accountRows.rows.find((row) => row.instagram_account_id === "acct-b")!;
    const ownAccount = await request(app).get(`/tenants/${tenantA.id}/leads?accountId=${rowA.id}`).set(authA);
    expect(ownAccount.status).toBe(200);
    expect(ownAccount.body).toHaveLength(1);
    expect(ownAccount.body[0].id).toBe(leadA.id);

    const otherAccount = await request(app).get(`/tenants/${tenantA.id}/leads?accountId=${rowB.id}`).set(authA);
    expect(otherAccount.status).toBe(200);
    expect(otherAccount.body).toHaveLength(1);
    expect(otherAccount.body[0].id).not.toBe(leadA.id);

    const foreignAccountRow = await pool.query<{ id: string }>(
      `select id from meta_tokens where tenant_id = $1 and instagram_account_id = $2`,
      [tenantB.id, "acct-other-tenant"],
    );
    const forged = await request(app).get(`/tenants/${tenantA.id}/leads?accountId=${foreignAccountRow.rows[0]!.id}`).set(authA);
    expect(forged.status).toBe(404);
    expect(forged.body).toMatchObject({ error: "Instagram account not found for this workspace" });
    expect(leadOtherTenant.tenantId).toBe(tenantB.id);
  });

  it("scopes analytics aggregates to a validated Instagram account", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "analytics-multi-account");
    const { tenant: otherTenant } = await createLoggedInTenant(pool, SESSION_SECRET, "analytics-other-workspace");
    const keyring = new Map([["v1", randomBytes(32)]]);
    const app = createApp();

    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "analytics-acct-a", accessToken: "unused-a" });
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "analytics-acct-b", accessToken: "unused-b" });
    await upsertToken(pool, keyring, { tenantId: otherTenant.id, instagramAccountId: "analytics-foreign", accessToken: "unused-foreign" });
    const accountRows = await pool.query<{ id: string; instagram_account_id: string }>(
      "select id, instagram_account_id from meta_tokens where tenant_id = $1",
      [tenant.id],
    );
    const rowA = accountRows.rows.find((row) => row.instagram_account_id === "analytics-acct-a")!;
    const rowB = accountRows.rows.find((row) => row.instagram_account_id === "analytics-acct-b")!;
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "same-person", "analytics-acct-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "same-person", "analytics-acct-b");

    await insertEventIdempotent(pool, {
      tenantId: tenant.id, leadId: leadA.id, metaEventId: "analytics-comment-a",
      eventType: "comment", occurredAt: new Date("2026-10-10T10:00:00Z"), sequence: 1,
      attributes: { mediaId: "shared-post-id", instagramAccountId: "analytics-acct-a", matchedKeyword: "fitness" },
    });
    await insertEventIdempotent(pool, {
      tenantId: tenant.id, leadId: leadB.id, metaEventId: "analytics-comment-b",
      eventType: "comment", occurredAt: new Date("2026-10-10T11:00:00Z"), sequence: 1,
      attributes: { mediaId: "shared-post-id", instagramAccountId: "analytics-acct-b", matchedKeyword: "real-estate" },
    });
    await pool.query(
      "insert into account_sends (tenant_id, instagram_account_id) values ($1, $2), ($1, $3)",
      [tenant.id, "analytics-acct-a", "analytics-acct-b"],
    );

    await recordDeadLetterEvent(pool, {
      queueName: "lead-events",
      sourceJobId: "analytics-dlq-a",
      jobData: { tenantId: tenant.id, leadId: leadA.id, leadEventId: "failed-a", sequence: 1, instagramAccountId: "analytics-acct-a" },
      failureOutput: { message: "failed A" },
    });
    await recordDeadLetterEvent(pool, {
      queueName: "lead-events",
      sourceJobId: "analytics-dlq-b",
      jobData: { tenantId: tenant.id, leadId: leadB.id, leadEventId: "failed-b", sequence: 1, instagramAccountId: "analytics-acct-b" },
      failureOutput: { message: "failed B" },
    });

    const funnelA = await request(app).get(`/tenants/${tenant.id}/analytics/funnel?accountId=${rowA.id}`).set(authHeader);
    const funnelB = await request(app).get(`/tenants/${tenant.id}/analytics/funnel?accountId=${rowB.id}`).set(authHeader);
    expect(funnelA.status).toBe(200);
    expect(funnelB.status).toBe(200);
    expect(funnelA.body.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "comments", count: 1 }),
      expect.objectContaining({ key: "dms", count: 1 }),
      expect.objectContaining({ key: "leads", count: 1 }),
    ]));
    expect(funnelB.body.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "comments", count: 1 }),
      expect.objectContaining({ key: "dms", count: 1 }),
      expect.objectContaining({ key: "leads", count: 1 }),
    ]));

    const keywordsA = await request(app).get(`/tenants/${tenant.id}/analytics/top-keywords?accountId=${rowA.id}`).set(authHeader);
    const keywordsB = await request(app).get(`/tenants/${tenant.id}/analytics/top-keywords?accountId=${rowB.id}`).set(authHeader);
    expect(keywordsA.status).toBe(200);
    expect(keywordsA.body.map((item: { keyword: string }) => item.keyword)).toEqual(["fitness"]);
    expect(keywordsB.status).toBe(200);
    expect(keywordsB.body.map((item: { keyword: string }) => item.keyword)).toEqual(["real-estate"]);

    const postsA = await request(app).get(`/tenants/${tenant.id}/analytics/top-posts?accountId=${rowA.id}`).set(authHeader);
    const postsB = await request(app).get(`/tenants/${tenant.id}/analytics/top-posts?accountId=${rowB.id}`).set(authHeader);
    expect(postsA.status).toBe(200);
    expect(postsB.status).toBe(200);
    expect(postsA.body[0]).toMatchObject({ mediaId: "shared-post-id", commentCount: 1 });
    expect(postsB.body[0]).toMatchObject({ mediaId: "shared-post-id", commentCount: 1 });

    const summaryA = await request(app).get(`/tenants/${tenant.id}/analytics?accountId=${rowA.id}`).set(authHeader);
    const summaryB = await request(app).get(`/tenants/${tenant.id}/analytics?accountId=${rowB.id}`).set(authHeader);
    expect(summaryA.status).toBe(200);
    expect(summaryB.status).toBe(200);
    expect(summaryA.body.dmFailures).toBe(1);
    expect(summaryB.body.dmFailures).toBe(1);

    const foreignRow = await pool.query<{ id: string }>(
      "select id from meta_tokens where tenant_id = $1 and instagram_account_id = $2",
      [otherTenant.id, "analytics-foreign"],
    );
    const forged = await request(app).get(`/tenants/${tenant.id}/analytics/funnel?accountId=${foreignRow.rows[0]!.id}`).set(authHeader);
    expect(forged.status).toBe(404);
    expect(forged.body).toMatchObject({ error: "Instagram account not found for this workspace" });
  });

});
