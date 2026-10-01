import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("journey publishing", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;

    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must point at a migrated test database to run this suite.",
      );
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("rejects unauthenticated publish requests", async () => {
    const app = createApp();

    const response = await request(app)
      .post(
        "/tenants/00000000-0000-0000-0000-000000000000/campaigns/00000000-0000-0000-0000-000000000000/journey/publish",
      )
      .send({ expectedBuilderVersion: 1 });

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated published-journey reads", async () => {
    const app = createApp();

    const response = await request(app).get(
      "/tenants/00000000-0000-0000-0000-000000000000/campaigns/00000000-0000-0000-0000-000000000000/journey/published",
    );

    expect(response.status).toBe(401);
  });

  it("publishes a valid journey as an immutable snapshot", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(
      pool,
      SESSION_SECRET,
      "creator-a",
    );

    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({
        name: "Publish test",
        keywords: ["LINK"],
      });

    expect(create.status).toBe(201);

    const campaignId = create.body.id as string;

    /*
     * A fresh campaign has the synthesized:
     *
     * trigger -> message -> human_handoff
     *
     * graph, which is valid for publishing.
     */
    const publish = await request(app)
      .post(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/publish`,
      )
      .set(authHeader)
      .send({
        expectedBuilderVersion: 1,
      });

    expect(publish.status).toBe(200);
    expect(publish.body.version).toBe(1);
    expect(publish.body.tenantId).toBe(tenant.id);
    expect(publish.body.campaignId).toBe(campaignId);
    expect(publish.body.graph.nodes).toHaveLength(3);

    const published = await request(app)
      .get(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/published`,
      )
      .set(authHeader);

    expect(published.status).toBe(200);
    expect(published.body.version).toBe(1);
    expect(published.body.graph.nodes).toHaveLength(3);
  });

  it("increments published version on subsequent publishes", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(
      pool,
      SESSION_SECRET,
      "creator-a",
    );

    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({
        name: "Version test",
        keywords: ["LINK"],
      });

    const campaignId = create.body.id as string;

    const first = await request(app)
      .post(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/publish`,
      )
      .set(authHeader)
      .send({
        expectedBuilderVersion: 1,
      });

    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);

    const second = await request(app)
      .post(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/publish`,
      )
      .set(authHeader)
      .send({
        expectedBuilderVersion: 1,
      });

    expect(second.status).toBe(200);
    expect(second.body.version).toBe(2);

    const latest = await request(app)
      .get(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/published`,
      )
      .set(authHeader);

    expect(latest.status).toBe(200);
    expect(latest.body.version).toBe(2);
  });

  it("rejects publishing with a stale builder version", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(
      pool,
      SESSION_SECRET,
      "creator-a",
    );

    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({
        name: "Concurrency test",
        keywords: ["LINK"],
      });

    const campaignId = create.body.id as string;

    /*
     * Change the builder from version 1 -> version 2.
     */
    const update = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${campaignId}/builder`)
      .set(authHeader)
      .send({
        expectedVersion: 1,
        nodes: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {},
            parentGroupId: null,
            collapsed: false,
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            type: "message",
            position: { x: 0, y: 100 },
            data: {},
            parentGroupId: null,
            collapsed: false,
          },
          {
            id: "33333333-3333-3333-3333-333333333333",
            type: "human_handoff",
            position: { x: 0, y: 200 },
            data: {},
            parentGroupId: null,
            collapsed: false,
          },
        ],
        edges: [
          {
            id: "44444444-4444-4444-4444-444444444444",
            sourceNodeId: "11111111-1111-1111-1111-111111111111",
            targetNodeId: "22222222-2222-2222-2222-222222222222",
            label: null,
            condition: null,
          },
          {
            id: "55555555-5555-5555-5555-555555555555",
            sourceNodeId: "22222222-2222-2222-2222-222222222222",
            targetNodeId: "33333333-3333-3333-3333-333333333333",
            label: null,
            condition: null,
          },
        ],
      });

    expect(update.status).toBe(200);
    expect(update.body.version).toBe(2);

    const publish = await request(app)
      .post(
        `/tenants/${tenant.id}/campaigns/${campaignId}/journey/publish`,
      )
      .set(authHeader)
      .send({
        expectedBuilderVersion: 1,
      });

    expect(publish.status).toBe(409);
    expect(publish.body.currentBuilderVersion).toBe(2);
  });
});
