import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { createDeal, listDealsForLead, updateDealStage } from "../deals.js";
import { listLeadActivity } from "../leadActivity.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("deals (Phase 2A Data Model Amendment: schema now, UI later)", () => {
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

  it("creates a deal defaulting to stage 'open' and currency 'USD', recording activity", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const deal = await createDeal(pool, {
      tenantId: tenant.id,
      customerId: lead.customerId!,
      leadId: lead.id,
      value: 500,
      actorUserId: owner.id,
    });

    expect(deal.stage).toBe("open");
    expect(deal.currency).toBe("USD");
    expect(deal.value).toBe(500);

    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "deal_created")).toHaveLength(1);
  });

  it("updateDealStage to 'won' stamps won_at and clears lost_at; moving back to 'open' clears both", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const deal = await createDeal(pool, { tenantId: tenant.id, customerId: lead.customerId!, leadId: lead.id });

    const won = await updateDealStage(pool, { tenantId: tenant.id, dealId: deal.id, stage: "won" });
    expect(won!.stage).toBe("won");
    expect(won!.wonAt).not.toBeNull();
    expect(won!.lostAt).toBeNull();

    const reopened = await updateDealStage(pool, { tenantId: tenant.id, dealId: deal.id, stage: "open" });
    expect(reopened!.wonAt).toBeNull();
    expect(reopened!.lostAt).toBeNull();
  });

  it("listDealsForLead returns newest first and is tenant-scoped", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");
    await createDeal(pool, { tenantId: tenantA.id, customerId: leadA.customerId!, leadId: leadA.id, value: 100 });
    await createDeal(pool, { tenantId: tenantA.id, customerId: leadA.customerId!, leadId: leadA.id, value: 200 });

    const deals = await listDealsForLead(pool, tenantA.id, leadA.id);
    expect(deals).toHaveLength(2);
    expect(deals[0]!.value).toBe(200); // most recently created first
  });

  it("updateDealStage returns null for a deal in a different tenant", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");
    const deal = await createDeal(pool, { tenantId: tenantA.id, customerId: leadA.customerId!, leadId: leadA.id });

    const result = await updateDealStage(pool, { tenantId: tenantB.id, dealId: deal.id, stage: "won" });
    expect(result).toBeNull();
  });
});
