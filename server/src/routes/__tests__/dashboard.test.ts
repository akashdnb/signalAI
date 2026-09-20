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
import type { LLMProvider } from "../../llm/provider.js";

const SESSION_SECRET = "test-session-secret";

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
    expect(res.body[0]).toMatchObject({ id: lead.id, username: "real_handle" });
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

  it("POST preview returns both a rule-based and an AI-generated sample reply, regardless of the campaign's current mode", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], {
      defaultReplyTemplate: "Hi {{username}}, thanks for {{keyword}}!",
    });

    const mockProvider: LLMProvider = { name: "mock", generateReply: vi.fn().mockResolvedValue("Here's the info!") };
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
});
