import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("leads routes (Phase 2A)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
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
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ kind: "activity", type: "note_added" });
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
