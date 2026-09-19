import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

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
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"] });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"], enabled: true });

    const list = await request(app).get(`/tenants/${tenant.id}/campaigns`).set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("rejects a campaign with no keywords", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Empty", keywords: [] });
    expect(res.status).toBe(400);
  });

  it("toggles enabled and 404s for a campaign that doesn't belong to the tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: otherTenant, authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const disable = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${create.body.id}/enabled`)
      .set(authHeader)
      .send({ enabled: false });
    expect(disable.status).toBe(200);

    // otherTenant is real and otherAuthHeader is a genuine member session
    // for it — but the campaign belongs to `tenant`, so this is a real
    // cross-tenant 404, not an auth rejection.
    const crossTenant = await request(app)
      .patch(`/tenants/${otherTenant.id}/campaigns/${create.body.id}/enabled`)
      .set(otherAuthHeader)
      .send({ enabled: true });
    expect(crossTenant.status).toBe(404);
  });

  // Identity Refactor regression: no session at all, or a session for a
  // different tenant than the one in the URL, must never reach the handler.
  it("rejects requests with no session and requests whose session is for a different tenant", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const noSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(noSession.status).toBe(401);

    const wrongTenantSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(otherAuthHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(wrongTenantSession.status).toBe(403);
  });
});
