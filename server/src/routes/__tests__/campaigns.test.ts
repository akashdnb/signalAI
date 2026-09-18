import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("campaigns routes", () => {
  beforeAll(() => {
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
      .send({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"] });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"], enabled: true });

    const list = await request(app).get(`/tenants/${tenant.id}/campaigns`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("rejects a campaign with no keywords", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();
    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .send({ name: "Empty", keywords: [] });
    expect(res.status).toBe(400);
  });

  it("toggles enabled and 404s for a campaign that doesn't belong to the tenant", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const otherTenant = await createTenant(getPool(), "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .send({ name: "Reel", keywords: ["LINK"] });

    const disable = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${create.body.id}/enabled`)
      .send({ enabled: false });
    expect(disable.status).toBe(200);

    const crossTenant = await request(app)
      .patch(`/tenants/${otherTenant.id}/campaigns/${create.body.id}/enabled`)
      .send({ enabled: true });
    expect(crossTenant.status).toBe(404);
  });
});
