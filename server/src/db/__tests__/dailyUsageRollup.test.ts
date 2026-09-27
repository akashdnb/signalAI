import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { upsertDailyUsageRollup, listUnsyncedRollups, markRollupSynced } from "../dailyUsageRollup.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("daily usage rollup (Phase 2B Daily Usage Rollup -> Stripe Metered Billing)", () => {
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

  it("upsert replaces (not adds to) the day's total on a re-run for the same tenant and date", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    await upsertDailyUsageRollup(pool, { tenantId: tenant.id, usageDate: "2026-09-21", promptTokens: 100, completionTokens: 20 });
    const rerun = await upsertDailyUsageRollup(pool, { tenantId: tenant.id, usageDate: "2026-09-21", promptTokens: 150, completionTokens: 30 });

    expect(rerun).toMatchObject({ promptTokens: 150, completionTokens: 30 });
    const rows = await pool.query("select count(*)::int as count from daily_usage_rollup where tenant_id = $1", [tenant.id]);
    expect(rows.rows[0].count).toBe(1); // one row per (tenant, date), not two
  });

  it("listUnsyncedRollups only returns rows with synced_to_stripe_at still null", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    const day1 = await upsertDailyUsageRollup(pool, { tenantId: tenant.id, usageDate: "2026-09-20", promptTokens: 10, completionTokens: 1 });
    const day2 = await upsertDailyUsageRollup(pool, { tenantId: tenant.id, usageDate: "2026-09-21", promptTokens: 20, completionTokens: 2 });
    await markRollupSynced(pool, day1.id);

    const unsynced = await listUnsyncedRollups(pool);
    expect(unsynced.map((r) => r.id)).toEqual([day2.id]);
  });
});
