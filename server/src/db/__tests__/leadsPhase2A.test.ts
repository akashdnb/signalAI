import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import {
  findOrCreateLeadByInstagramUserId,
  updatePipelineStage,
  assignLeadOwner,
  updateHandoffStatus,
  listLeadsForTenant,
} from "../leads.js";
import { listLeadActivity } from "../leadActivity.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("leads Phase 2A: pipeline, ownership, handoff", () => {
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

  it("a new lead defaults to pipeline_stage 'new' and handoff_status 'ai'", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    expect(lead.pipelineStage).toBe("new");
    expect(lead.handoffStatus).toBe("ai");
    expect(lead.ownerUserId).toBeNull();
  });

  it("updatePipelineStage moves the lead and records a lead_activity entry", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const updated = await updatePipelineStage(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      stage: "qualified",
      actorUserId: owner.id,
    });

    expect(updated!.pipelineStage).toBe("qualified");
    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]!.type).toBe("pipeline_stage_changed");
    expect(activity[0]!.actorUserId).toBe(owner.id);
  });

  it("updatePipelineStage returns null for a lead in a different tenant", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");

    const result = await updatePipelineStage(pool, { tenantId: tenantB.id, leadId: lead.id, stage: "won" });
    expect(result).toBeNull();
  });

  it("assignLeadOwner sets and clears ownership, recording activity both times", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const assigned = await assignLeadOwner(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      ownerUserId: owner.id,
      ownerEmail: owner.email,
    });
    expect(assigned!.ownerUserId).toBe(owner.id);

    const unassigned = await assignLeadOwner(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      ownerUserId: null,
      ownerEmail: null,
    });
    expect(unassigned!.ownerUserId).toBeNull();

    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "owner_assigned")).toHaveLength(2);
  });

  it("updateHandoffStatus transitions ai -> requested -> human -> ai, recording activity each time", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await updateHandoffStatus(pool, { tenantId: tenant.id, leadId: lead.id, status: "requested" });
    await updateHandoffStatus(pool, { tenantId: tenant.id, leadId: lead.id, status: "human" });
    const final = await updateHandoffStatus(pool, { tenantId: tenant.id, leadId: lead.id, status: "ai" });

    expect(final!.handoffStatus).toBe("ai");
    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "handoff_changed")).toHaveLength(3);
  });

  describe("listLeadsForTenant filters", () => {
    it("filters by pipeline stage", async () => {
      const pool = getPool();
      const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
      const tenant = await createTenantForUser(pool, "creator-a", owner.id);
      const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
      await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");
      await updatePipelineStage(pool, { tenantId: tenant.id, leadId: leadA.id, stage: "won" });

      const won = await listLeadsForTenant(pool, tenant.id, 100, { stage: "won" });
      expect(won).toHaveLength(1);
      expect(won[0]!.id).toBe(leadA.id);
    });

    it("filters by owner", async () => {
      const pool = getPool();
      const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
      const tenant = await createTenantForUser(pool, "creator-a", owner.id);
      const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
      await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");
      await assignLeadOwner(pool, { tenantId: tenant.id, leadId: leadA.id, ownerUserId: owner.id, ownerEmail: owner.email });

      const assigned = await listLeadsForTenant(pool, tenant.id, 100, { ownerUserId: owner.id });
      expect(assigned).toHaveLength(1);
      expect(assigned[0]!.id).toBe(leadA.id);
    });

    it("an unfiltered list still returns every lead for the tenant, unaffected by the new columns", async () => {
      const pool = getPool();
      const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
      const tenant = await createTenantForUser(pool, "creator-a", owner.id);
      await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
      await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");

      const all = await listLeadsForTenant(pool, tenant.id);
      expect(all).toHaveLength(2);
      expect(all.every((l) => l.pipelineStage === "new")).toBe(true);
    });
  });
});
