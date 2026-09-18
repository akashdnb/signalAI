import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { createCampaign } from "../campaigns.js";
import {
  getFirstMilestone,
  getNextMilestone,
  listMilestones,
  recordMilestoneAdvancement,
  setCampaignMilestones,
} from "../milestones.js";
import { getCapturedFacts, hardScrubCapturedFacts, mergeCapturedFacts } from "../capturedFacts.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("milestones and captured facts", () => {
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

  it("sets an ordered milestone list and reads it back in order", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

    await setCampaignMilestones(pool, tenant.id, campaign.id, [
      { goalDescription: "capture email", captureField: "email" },
      { goalDescription: "send pricing" },
      { goalDescription: "book a call", captureField: "preferredTime" },
    ]);

    const milestones = await listMilestones(pool, tenant.id, campaign.id);
    expect(milestones.map((m) => m.goalDescription)).toEqual(["capture email", "send pricing", "book a call"]);
    expect(milestones.map((m) => m.ordinal)).toEqual([0, 1, 2]);
  });

  it("replacing the milestone list wholesale removes the old ones, not appends", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "first version" }]);
    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "replaced version" }]);

    const milestones = await listMilestones(pool, tenant.id, campaign.id);
    expect(milestones).toHaveLength(1);
    expect(milestones[0]!.goalDescription).toBe("replaced version");
  });

  it("getFirstMilestone and getNextMilestone walk the ordered list correctly", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    await setCampaignMilestones(pool, tenant.id, campaign.id, [
      { goalDescription: "step 1" },
      { goalDescription: "step 2" },
      { goalDescription: "step 3" },
    ]);

    const first = await getFirstMilestone(pool, tenant.id, campaign.id);
    expect(first?.goalDescription).toBe("step 1");

    const second = await getNextMilestone(pool, tenant.id, campaign.id, first!.ordinal);
    expect(second?.goalDescription).toBe("step 2");

    const third = await getNextMilestone(pool, tenant.id, campaign.id, second!.ordinal);
    expect(third?.goalDescription).toBe("step 3");

    const fourth = await getNextMilestone(pool, tenant.id, campaign.id, third!.ordinal);
    expect(fourth).toBeNull(); // end of the funnel
  });

  it("merges captured facts across multiple milestones without clobbering earlier ones", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await pool.query("insert into leads (tenant_id) values ($1) returning id", [tenant.id]);
    const leadId = lead.rows[0].id;

    await mergeCapturedFacts(pool, tenant.id, leadId, { email: "a@b.com" });
    await mergeCapturedFacts(pool, tenant.id, leadId, { budget: "$500" });

    const facts = await getCapturedFacts(pool, tenant.id, leadId);
    expect(facts).toEqual({ email: "a@b.com", budget: "$500" });
  });

  it("hard-scrubs captured facts on deletion", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await pool.query("insert into leads (tenant_id) values ($1) returning id", [tenant.id]);
    const leadId = lead.rows[0].id;

    await mergeCapturedFacts(pool, tenant.id, leadId, { email: "a@b.com" });
    await hardScrubCapturedFacts(pool, leadId);

    const facts = await getCapturedFacts(pool, tenant.id, leadId);
    expect(facts).toEqual({});
  });

  it("records an append-only milestone advancement", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
    const [milestone] = await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "step 1" }]);
    const lead = await pool.query("insert into leads (tenant_id) values ($1) returning id", [tenant.id]);
    const leadId = lead.rows[0].id;

    await recordMilestoneAdvancement(pool, tenant.id, leadId, campaign.id, milestone!.id);

    const rows = await pool.query("select count(*)::int as count from milestone_advancements where lead_id = $1", [
      leadId,
    ]);
    expect(rows.rows[0].count).toBe(1);
  });
});
