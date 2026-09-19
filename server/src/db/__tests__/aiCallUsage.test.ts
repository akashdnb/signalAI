import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { countRecentAiCalls, deleteAiCallUsage, pruneOldAiCallUsage, recordAiCall } from "../aiCallUsage.js";

describe("aiCallUsage", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table ai_call_usage");
  });

  afterAll(async () => {
    await closePool();
  });

  it("records a call and counts it", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await recordAiCall(pool, tenant.id, "acct-1");
    expect(await countRecentAiCalls(pool, "acct-1")).toBe(1);
  });

  // R7-02: a refunded (deleted) reservation must not count against the cap.
  it("deleteAiCallUsage removes exactly the refunded reservation, not others for the same account", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const idToRefund = await recordAiCall(pool, tenant.id, "acct-1");
    await recordAiCall(pool, tenant.id, "acct-1");

    await deleteAiCallUsage(pool, idToRefund);

    expect(await countRecentAiCalls(pool, "acct-1")).toBe(1);
  });

  it("pruneOldAiCallUsage (R7-04) deletes rows older than the cutoff, leaves recent ones", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await recordAiCall(pool, tenant.id, "acct-old");
    await recordAiCall(pool, tenant.id, "acct-recent");
    await pool.query(`update ai_call_usage set called_at = now() - interval '48 hours' where instagram_account_id = $1`, [
      "acct-old",
    ]);

    const deleted = await pruneOldAiCallUsage(pool, 24);
    expect(deleted).toBe(1);

    const remaining = await pool.query("select instagram_account_id from ai_call_usage");
    expect(remaining.rows.map((r) => r.instagram_account_id)).toEqual(["acct-recent"]);
  });
});
