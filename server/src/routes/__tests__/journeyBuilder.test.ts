import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("journey builder graph routes", () => {
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

  it("GET returns a synthesized default graph for a freshly created campaign", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const res = await request(app).get(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.nodes.map((n: { type: string }) => n.type)).toEqual([
      "trigger",
      "message",
      "human_handoff",
    ]);
  });

  it("synchronizes graph milestone nodes across add, remove, and reorder operations", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    const campaignId = create.body.id as string;
    const milestonesPath = `/tenants/${tenant.id}/campaigns/${campaignId}/milestones`;
    const graphPath = `/tenants/${tenant.id}/campaigns/${campaignId}/builder`;

    const firstSave = await request(app).put(milestonesPath).set(authHeader).send({
      milestones: ["M1", "M2", "M3"].map((goalDescription) => ({ goalDescription })),
      oldIndexToNewIndex: [],
    });
    expect(firstSave.status).toBe(200);
    const initialGraphResponse = await request(app).get(graphPath).set(authHeader);
    const initialGroups = initialGraphResponse.body.nodes.filter((node: { type: string }) => node.type === "milestone_group");
    expect(initialGroups).toHaveLength(3);
    expect(initialGroups.map((node: { data: { milestoneId: string } }) => node.data.milestoneId)).toEqual(
      firstSave.body.map((milestone: { id: string }) => milestone.id),
    );
    const originalNodeIds = initialGroups.map((node: { id: string }) => node.id);

    const addSave = await request(app).put(milestonesPath).set(authHeader).send({
      milestones: ["M1", "M2", "M3", "M4"].map((goalDescription) => ({ goalDescription })),
      oldIndexToNewIndex: [0, 1, 2],
    });
    expect(addSave.status).toBe(200);
    let graphResponse = await request(app).get(graphPath).set(authHeader);
    let groups = graphResponse.body.nodes
      .filter((node: { type: string }) => node.type === "milestone_group")
      .sort((a: { position: { y: number } }, b: { position: { y: number } }) => a.position.y - b.position.y);
    expect(groups).toHaveLength(4);
    expect(groups.slice(0, 3).map((node: { id: string }) => node.id)).toEqual(originalNodeIds);

    const removeSave = await request(app).put(milestonesPath).set(authHeader).send({
      milestones: ["M1", "M3", "M4"].map((goalDescription) => ({ goalDescription })),
      oldIndexToNewIndex: [0, null, 1, 2],
    });
    expect(removeSave.status).toBe(200);
    graphResponse = await request(app).get(graphPath).set(authHeader);
    groups = graphResponse.body.nodes
      .filter((node: { type: string }) => node.type === "milestone_group")
      .sort((a: { position: { y: number } }, b: { position: { y: number } }) => a.position.y - b.position.y);
    expect(groups).toHaveLength(3);
    expect(groups.map((node: { data: { milestoneId: string } }) => node.data.milestoneId)).toEqual(
      removeSave.body.map((milestone: { id: string }) => milestone.id),
    );
    const nodeIdsBeforeReorder = groups.map((node: { id: string }) => node.id);
    const remainingNodeIds = new Set(graphResponse.body.nodes.map((node: { id: string }) => node.id));
    expect(graphResponse.body.edges.every((edge: { sourceNodeId: string; targetNodeId: string }) =>
      remainingNodeIds.has(edge.sourceNodeId) && remainingNodeIds.has(edge.targetNodeId),
    )).toBe(true);

    const reorderedSave = await request(app).put(milestonesPath).set(authHeader).send({
      milestones: ["M4", "M1", "M3"].map((goalDescription) => ({ goalDescription })),
      oldIndexToNewIndex: [1, 2, 0],
    });
    expect(reorderedSave.status).toBe(200);
    graphResponse = await request(app).get(graphPath).set(authHeader);
    groups = graphResponse.body.nodes
      .filter((node: { type: string }) => node.type === "milestone_group")
      .sort((a: { position: { y: number } }, b: { position: { y: number } }) => a.position.y - b.position.y);
    expect(groups.map((node: { data: { milestoneId: string } }) => node.data.milestoneId)).toEqual(
      reorderedSave.body.map((milestone: { id: string }) => milestone.id),
    );
    expect(groups.map((node: { id: string }) => node.id)).toEqual([
      nodeIdsBeforeReorder[2], nodeIdsBeforeReorder[0], nodeIdsBeforeReorder[1],
    ]);
  });

  it("GET 404s for a campaign that doesn't belong to the tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const res = await request(app)
      .get(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`)
      .set(otherAuthHeader);
    expect(res.status).toBe(403); // otherAuthHeader's session isn't a member of `tenant` at all
  });

  it("PUT saves a graph atomically, and GET then returns the saved version, not a fresh synthesis", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    const campaignId = create.body.id;

    const triggerId = "11111111-1111-1111-1111-111111111111";
    const messageId = "22222222-2222-2222-2222-222222222222";
    const put = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${campaignId}/builder`)
      .set(authHeader)
      .send({
        expectedVersion: 1,
        nodes: [
          { id: triggerId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false },
          { id: messageId, type: "message", position: { x: 0, y: 160 }, data: { text: "hi" }, parentGroupId: null, collapsed: false },
        ],
        edges: [{ id: "33333333-3333-3333-3333-333333333333", sourceNodeId: triggerId, targetNodeId: messageId, label: null, condition: null }],
      });
    expect(put.status).toBe(200);
    expect(put.body.version).toBe(2);

    const reread = await request(app).get(`/tenants/${tenant.id}/campaigns/${campaignId}/builder`).set(authHeader);
    expect(reread.body.version).toBe(2);
    expect(reread.body.nodes).toHaveLength(2);
  });

  it("PUT with a stale expectedVersion 409s and reports the current version", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    const campaignId = create.body.id;
    const nodeId = "11111111-1111-1111-1111-111111111111";
    const body = {
      expectedVersion: 1,
      nodes: [{ id: nodeId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false }],
      edges: [],
    };

    const firstPut = await request(app).put(`/tenants/${tenant.id}/campaigns/${campaignId}/builder`).set(authHeader).send(body);
    expect(firstPut.status).toBe(200);

    const stalePut = await request(app).put(`/tenants/${tenant.id}/campaigns/${campaignId}/builder`).set(authHeader).send(body);
    expect(stalePut.status).toBe(409);
    expect(stalePut.body.currentVersion).toBe(2);
  });

  it("PUT rejects a malformed node shape with 400", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const res = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`)
      .set(authHeader)
      .send({ expectedVersion: 1, nodes: [{ id: "x" }], edges: [] });
    expect(res.status).toBe(400);
  });

  it("PUT rejects a structurally invalid graph (dangling edge reference) with 400", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    const nodeId = "11111111-1111-1111-1111-111111111111";

    const res = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`)
      .set(authHeader)
      .send({
        expectedVersion: 1,
        nodes: [{ id: nodeId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false }],
        edges: [{ id: "22222222-2222-2222-2222-222222222222", sourceNodeId: nodeId, targetNodeId: "not-a-real-node", label: null, condition: null }],
      });
    expect(res.status).toBe(400);
    expect(res.body.details.some((d: string) => d.includes("unknown target node"))).toBe(true);
  });

  it("PUT rejects expectedVersion that isn't an integer", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const res = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`)
      .set(authHeader)
      .send({ expectedVersion: "1", nodes: [], edges: [] });
    expect(res.status).toBe(400);
  });

  it("rejects requests with no session and requests whose session is for a different tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const noSession = await request(app).get(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`);
    expect(noSession.status).toBe(401);

    const wrongTenant = await request(app)
      .get(`/tenants/${tenant.id}/campaigns/${create.body.id}/builder`)
      .set(otherAuthHeader);
    expect(wrongTenant.status).toBe(403);
  });
});
