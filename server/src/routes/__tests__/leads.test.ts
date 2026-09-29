import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { mergeCapturedFacts } from "../../db/capturedFacts.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";
// Same rationale as routes/__tests__/campaigns.test.ts: generated per run
// (not a fixed literal) and must decode via config.tokenKeyring, since
// routes/leads.ts's /reply endpoint decrypts through that, not a keyring
// passed in directly.
const TOKEN_KEY = randomBytes(32);
const keyring = new Map<string, Buffer>([["v1", TOKEN_KEY]]);

describe("leads routes (Phase 2A)", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEYS = `v1:${TOKEN_KEY.toString("base64")}`;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET a lead's detail, including the new Phase 2A fields", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: lead.id, pipelineStage: "new", handoffStatus: "ai", ownerUserId: null });
  });

  it("GET a lead's detail includes username from lead_pii, and null when the lead has none yet", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const dmOnlyLead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-dm-only");
    const noUsername = await request(app).get(`/tenants/${tenant.id}/leads/${dmOnlyLead.id}`).set(authHeader);
    expect(noUsername.status).toBe(200);
    expect(noUsername.body.username).toBeNull();

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-username",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, username: "real_handle" });

    const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("real_handle");
  });

  it("404s a lead detail request for a lead in a different tenant", async () => {
    const pool = getPool();
    const { tenant: tenantA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: tenantB, authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenantB.id}/leads/${leadA.id}`).set(authB);
    expect(res.status).toBe(404);
  });

  it("PATCH updates pipeline stage", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app)
      .patch(`/tenants/${tenant.id}/leads/${lead.id}`)
      .set(authHeader)
      .send({ pipelineStage: "qualified" });
    expect(res.status).toBe(200);
    expect(res.body.pipelineStage).toBe("qualified");
  });

  it("PATCH rejects an ownerUserId that isn't a member of this tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app)
      .patch(`/tenants/${tenant.id}/leads/${lead.id}`)
      .set(authHeader)
      .send({ ownerUserId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
  });

  it("PATCH assigns ownership to an actual tenant member", async () => {
    const pool = getPool();
    const { tenant, user, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app)
      .patch(`/tenants/${tenant.id}/leads/${lead.id}`)
      .set(authHeader)
      .send({ ownerUserId: user.id });
    expect(res.status).toBe(200);
    expect(res.body.ownerUserId).toBe(user.id);
  });

  it("POST /handoff takeover then release round-trips handoffStatus", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const takeover = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/handoff`).set(authHeader).send({ action: "takeover" });
    expect(takeover.status).toBe(200);
    expect(takeover.body.handoffStatus).toBe("human");

    const release = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/handoff`).set(authHeader).send({ action: "release" });
    expect(release.status).toBe(200);
    expect(release.body.handoffStatus).toBe("ai");
  });

  it("POST /handoff rejects an unknown action", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/handoff`).set(authHeader).send({ action: "bogus" });
    expect(res.status).toBe(400);
  });

  it("POST /reply sends a DM and records it as a human sent_reply, once taken over with the messaging window open", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await pool.query(`update leads set window_open_until = now() + interval '1 hour' where id = $1`, [lead.id]);
    const app = createApp();

    await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/handoff`).set(authHeader).send({ action: "takeover" });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: "mid-1" }),
    } as Response);

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/reply`).set(authHeader).send({ text: "Sure, here's the pricing." });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const replies = await pool.query(`select channel, engine, text, meta_message_id from sent_replies where lead_id = $1`, [lead.id]);
    expect(replies.rows).toEqual([
      { channel: "dm", engine: "human", text: "Sure, here's the pricing.", meta_message_id: "mid-1" },
    ]);
  });

  it("POST /reply 400s when the conversation hasn't been taken over", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await pool.query(`update leads set window_open_until = now() + interval '1 hour' where id = $1`, [lead.id]);
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/reply`).set(authHeader).send({ text: "Hi" });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POST /reply 409s when the messaging window is closed", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/handoff`).set(authHeader).send({ action: "takeover" });

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/reply`).set(authHeader).send({ text: "Hi" });
    expect(res.status).toBe(409);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POST /reply rejects an empty text", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/reply`).set(authHeader).send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("GET /captured-facts returns what the Milestone Engine has learned about the lead", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const empty = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/captured-facts`).set(authHeader);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ facts: {} });

    await mergeCapturedFacts(pool, tenant.id, lead.id, { budget: "1.5Cr", location: "Whitefield" });

    const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/captured-facts`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ facts: { budget: "1.5Cr", location: "Whitefield" } });
  });

  it("GET /captured-facts 404s for a lead in a different tenant", async () => {
    const pool = getPool();
    const { tenant: tenantA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenantA.id}/leads/${leadA.id}/captured-facts`).set(authB);
    expect(res.status).toBe(403);
  });

  it("POST /read marks a conversation read, 404s for an unknown lead", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const ok = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/read`).set(authHeader);
    expect(ok.status).toBe(204);

    const missing = await request(app).post(`/tenants/${tenant.id}/leads/00000000-0000-0000-0000-000000000000/read`).set(authHeader);
    expect(missing.status).toBe(404);
  });

  it("POST and GET notes", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const post = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/notes`).set(authHeader).send({ body: "Great fit" });
    expect(post.status).toBe(201);

    const list = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/notes`).set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].body).toBe("Great fit");
  });

  it("POST a note rejects an empty body", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/notes`).set(authHeader).send({ body: "   " });
    expect(res.status).toBe(400);
  });

  it("tags: create-by-name, list on lead, remove", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const add = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/tags`).set(authHeader).send({ name: "hot lead" });
    expect(add.status).toBe(201);
    const tagId = add.body.id;

    const onLead = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/tags`).set(authHeader);
    expect(onLead.body).toHaveLength(1);
    expect(onLead.body[0].name).toBe("hot lead");

    const tenantTags = await request(app).get(`/tenants/${tenant.id}/tags`).set(authHeader);
    expect(tenantTags.body).toHaveLength(1);

    const remove = await request(app).delete(`/tenants/${tenant.id}/leads/${lead.id}/tags/${tagId}`).set(authHeader);
    expect(remove.status).toBe(204);

    const afterRemove = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/tags`).set(authHeader);
    expect(afterRemove.body).toHaveLength(0);
  });

  it("deals: create then update stage", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const create = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/deals`).set(authHeader).send({ value: 1000 });
    expect(create.status).toBe(201);
    expect(create.body.stage).toBe("open");

    const update = await request(app).patch(`/tenants/${tenant.id}/deals/${create.body.id}`).set(authHeader).send({ stage: "won" });
    expect(update.status).toBe(200);
    expect(update.body.stage).toBe("won");

    const list = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/deals`).set(authHeader);
    expect(list.body).toHaveLength(1);
  });

  it("GET timeline merges events and activity", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/notes`).set(authHeader).send({ body: "First contact" });

    const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/timeline`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({ kind: "activity", type: "note_added" });
    expect(res.body.hasMore).toBe(false);
    expect(res.body.nextCursor).toBeNull();
  });

  it("GET timeline paginates with `limit` and `before`, oldest-first within each page", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    for (let i = 0; i < 3; i++) {
      await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/notes`).set(authHeader).send({ body: `note ${i}` });
    }

    // Page 1 (no cursor): the 2 MOST RECENT notes, oldest-first within the
    // page — "note 2" was created last, so the default (most recent) page
    // is ["note 1", "note 2"], not the oldest two.
    const first = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/timeline?limit=2`).set(authHeader);
    expect(first.status).toBe(200);
    expect(first.body.entries).toHaveLength(2);
    expect(first.body.entries.map((e: { summary: string }) => e.summary)).toEqual(["note 1", "note 2"]);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).toBeTruthy();

    // Page 2: everything strictly older than page 1's oldest entry.
    const second = await request(app)
      .get(`/tenants/${tenant.id}/leads/${lead.id}/timeline?limit=2&before=${encodeURIComponent(first.body.nextCursor)}`)
      .set(authHeader);
    expect(second.status).toBe(200);
    expect(second.body.entries).toHaveLength(1);
    expect(second.body.entries[0]).toMatchObject({ summary: "note 0" });
    expect(second.body.hasMore).toBe(false);
  });

  it("GET timeline rejects an invalid `before` value", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/timeline?before=not-a-date`).set(authHeader);
    expect(res.status).toBe(400);
  });

  it("GET /members lists the tenant's members for the assignment dropdown", async () => {
    const pool = getPool();
    const { tenant, user, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}/members`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ userId: user.id, email: user.email, role: "owner" }]);
  });

  it("every route rejects a request with no session", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}/leads/some-id`);
    expect(res.status).toBe(401);
  });
});
