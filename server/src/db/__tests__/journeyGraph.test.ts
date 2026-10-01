import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { createCampaign, updateCampaignReplyConfig } from "../campaigns.js";
import { getBuilderGraph, saveBuilderGraph, type JourneyEdge, type JourneyNode } from "../journeyGraph.js";
import { resetDb } from "../../__tests__/helpers/db.js";

function makeChain(): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  const a: JourneyNode = { id: "11111111-1111-1111-1111-111111111111", type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false };
  const b: JourneyNode = { id: "22222222-2222-2222-2222-222222222222", type: "message", position: { x: 0, y: 160 }, data: { text: "hi" }, parentGroupId: null, collapsed: false };
  const edge: JourneyEdge = { id: "33333333-3333-3333-3333-333333333333", sourceNodeId: a.id, targetNodeId: b.id, label: null, condition: null };
  return { nodes: [a, b], edges: [edge] };
}

describe("journey graph (advanced Automation Builder)", () => {
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

  it("synthesizes a default trigger->message->milestones->handoff graph for a campaign that never saved one", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

    const graph = await getBuilderGraph(pool, tenant.id, campaign.id);
    expect(graph).not.toBeNull();
    expect(graph!.version).toBe(1);
    expect(graph!.nodes.map((n) => n.type)).toEqual(["trigger", "message", "human_handoff"]);
    expect(graph!.edges).toHaveLength(3);
    // chained trigger -> message -> milestones -> handoff
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]));
    for (const edge of graph!.edges) {
      expect(byId.get(edge.sourceNodeId)).toBeDefined();
      expect(byId.get(edge.targetNodeId)).toBeDefined();
    }
  });

  it("includes an action_link node in the default graph when the campaign has a CTA link", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    await updateCampaignReplyConfig(pool, tenant.id, campaign.id, { ctaLink: "https://example.com" });

    const graph = await getBuilderGraph(pool, tenant.id, campaign.id);
    expect(graph!.nodes.map((n) => n.type)).toContain("action_link");
  });

  it("returns null for a campaign that doesn't belong to the tenant", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const otherTenant = await createTenant(pool, "creator-b");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

    expect(await getBuilderGraph(pool, otherTenant.id, campaign.id)).toBeNull();
  });

  it("saves a graph and reads the persisted version back (no longer synthesized)", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const { nodes, edges } = makeChain();

    const saved = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, nodes, edges);
    expect(saved.status).toBe("ok");
    if (saved.status !== "ok") return;
    expect(saved.graph.version).toBe(2);

    const reread = await getBuilderGraph(pool, tenant.id, campaign.id);
    expect(reread!.version).toBe(2);
    expect(reread!.nodes).toHaveLength(2);
    expect(reread!.nodes.find((n) => n.type === "message")!.data).toEqual({ text: "hi" });
    expect(reread!.edges).toHaveLength(1);
  });

  it("replaces the whole graph wholesale on a second save, not appends", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const first = makeChain();
    await saveBuilderGraph(pool, tenant.id, campaign.id, 1, first.nodes, first.edges);

    const onlyTrigger: JourneyNode[] = [
      { id: "44444444-4444-4444-4444-444444444444", type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false },
    ];
    const saved = await saveBuilderGraph(pool, tenant.id, campaign.id, 2, onlyTrigger, []);
    expect(saved.status).toBe("ok");

    const reread = await getBuilderGraph(pool, tenant.id, campaign.id);
    expect(reread!.nodes).toHaveLength(1);
    expect(reread!.edges).toHaveLength(0);
  });

  it("rejects a save built on a stale version with a conflict, reporting the current version", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const { nodes, edges } = makeChain();

    const firstSave = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, nodes, edges);
    expect(firstSave.status).toBe("ok");

    // A second editor still working off version 1 tries to save.
    const staleSave = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, nodes, edges);
    expect(staleSave.status).toBe("conflict");
    if (staleSave.status !== "conflict") return;
    expect(staleSave.currentVersion).toBe(2);
  });

  it("rejects an edge that references a node id not present in the same save", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const node: JourneyNode = { id: "55555555-5555-5555-5555-555555555555", type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false };
    const danglingEdge: JourneyEdge = {
      id: "66666666-6666-6666-6666-666666666666",
      sourceNodeId: node.id,
      targetNodeId: "99999999-9999-9999-9999-999999999999",
      label: null,
      condition: null,
    };

    const result = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, [node], [danglingEdge]);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.some((e) => e.includes("unknown target node"))).toBe(true);
  });

  it("rejects duplicate node ids", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const dupeId = "77777777-7777-7777-7777-777777777777";
    const nodes: JourneyNode[] = [
      { id: dupeId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false },
      { id: dupeId, type: "message", position: { x: 0, y: 160 }, data: {}, parentGroupId: null, collapsed: false },
    ];

    const result = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, nodes, []);
    expect(result.status).toBe("invalid");
  });

  it("rejects a node whose parentGroupId doesn't reference another node in the save", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const node: JourneyNode = {
      id: "88888888-8888-8888-8888-888888888888",
      type: "message",
      position: { x: 0, y: 0 },
      data: {},
      parentGroupId: "00000000-0000-0000-0000-000000000000",
      collapsed: false,
    };

    const result = await saveBuilderGraph(pool, tenant.id, campaign.id, 1, [node], []);
    expect(result.status).toBe("invalid");
  });

  it("returns not_found for a campaign that doesn't belong to the tenant", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const otherTenant = await createTenant(pool, "creator-b");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const { nodes, edges } = makeChain();

    const result = await saveBuilderGraph(pool, otherTenant.id, campaign.id, 1, nodes, edges);
    expect(result.status).toBe("not_found");
  });
});
