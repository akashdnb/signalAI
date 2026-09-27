import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { recordTokenUsage, getTokenUsageSince, getDailyTokenTotals } from "../tokenUsage.js";
import { resetDb } from "../../__tests__/helpers/db.js";

async function seedEvent(pool: ReturnType<typeof getPool>, tenantId: string, leadId: string, metaEventId: string) {
  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId,
    metaEventId,
    eventType: "comment",
    occurredAt: new Date(),
    sequence: 1,
  });
  return event!;
}

describe("token usage ledger (Phase 2B Per-Tenant Usage Ledger)", () => {
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

  it("recordTokenUsage is idempotent per lead_event_id — a retry never double-bills", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await seedEvent(pool, tenant.id, lead.id, "evt-1");

    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event.id, promptTokens: 100, completionTokens: 50 });
    // A worker retry re-runs the same event — this must be a no-op, not a second row.
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event.id, promptTokens: 100, completionTokens: 50 });

    const usage = await getTokenUsageSince(pool, tenant.id, new Date(0));
    expect(usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
  });

  it("getTokenUsageSince sums only usage at or after the given timestamp", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event1 = await seedEvent(pool, tenant.id, lead.id, "evt-1");
    const event2 = await seedEvent(pool, tenant.id, lead.id, "evt-2");

    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event1.id, promptTokens: 10, completionTokens: 5 });

    const cutoff = new Date(Date.now() + 60_000); // one minute in the future — event1 predates this
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event2.id, promptTokens: 20, completionTokens: 10 });

    const sinceCutoff = await getTokenUsageSince(pool, tenant.id, cutoff);
    expect(sinceCutoff.totalTokens).toBe(0); // both calls happened before the (future) cutoff
  });

  it("getTokenUsageSince returns zeros for a tenant with no usage yet", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    const usage = await getTokenUsageSince(pool, tenant.id, new Date(0));
    expect(usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("getDailyTokenTotals groups by tenant for a given UTC date", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-b");
    const eventA = await seedEvent(pool, tenantA.id, leadA.id, "evt-a");
    const eventB = await seedEvent(pool, tenantB.id, leadB.id, "evt-b");

    await recordTokenUsage(pool, { tenantId: tenantA.id, leadEventId: eventA.id, promptTokens: 100, completionTokens: 20 });
    await recordTokenUsage(pool, { tenantId: tenantB.id, leadEventId: eventB.id, promptTokens: 200, completionTokens: 40 });

    const today = new Date().toISOString().slice(0, 10);
    const totals = await getDailyTokenTotals(pool, today);

    expect(totals).toHaveLength(2);
    const byTenant = Object.fromEntries(totals.map((t) => [t.tenantId, t]));
    expect(byTenant[tenantA.id]).toMatchObject({ promptTokens: 100, completionTokens: 20 });
    expect(byTenant[tenantB.id]).toMatchObject({ promptTokens: 200, completionTokens: 40 });
  });
});
