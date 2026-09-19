import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { createSessionToken } from "../../lib/session.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const SESSION_SECRET = "test-session-secret";

function authHeader(tenantId: string) {
  return { Authorization: `Bearer ${createSessionToken(SESSION_SECRET, tenantId)}` };
}

describe("campaigns routes", () => {
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

  it("creates a campaign and lists it back", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader(tenant.id))
      .send({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"] });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"], enabled: true });

    const list = await request(app).get(`/tenants/${tenant.id}/campaigns`).set(authHeader(tenant.id));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("rejects a campaign with no keywords", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();
    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader(tenant.id))
      .send({ name: "Empty", keywords: [] });
    expect(res.status).toBe(400);
  });

  it("toggles enabled and 404s for a campaign that doesn't belong to the tenant", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const otherTenant = await createTenant(getPool(), "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader(tenant.id))
      .send({ name: "Reel", keywords: ["LINK"] });

    const disable = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${create.body.id}/enabled`)
      .set(authHeader(tenant.id))
      .send({ enabled: false });
    expect(disable.status).toBe(200);

    const crossTenant = await request(app)
      .patch(`/tenants/${otherTenant.id}/campaigns/${create.body.id}/enabled`)
      .set(authHeader(otherTenant.id))
      .send({ enabled: true });
    expect(crossTenant.status).toBe(404);
  });

  // R10-01 regression: no session at all, or a session for a different
  // tenant than the one in the URL, must never reach the handler.
  it("rejects requests with no session and requests whose session is for a different tenant", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const otherTenant = await createTenant(getPool(), "creator-b");
    const app = createApp();

    const noSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(noSession.status).toBe(401);

    const wrongTenantSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader(otherTenant.id))
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(wrongTenantSession.status).toBe(403);
  });
});
