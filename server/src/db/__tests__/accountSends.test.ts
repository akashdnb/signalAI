import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { pruneOldSends, tryReserveSend } from "../accountSends.js";

describe("tryReserveSend (R6-02/R6-03)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table account_sends");
  });

  afterAll(async () => {
    await closePool();
  });

  it("reserves a slot and records it in one statement when under the limit", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    const reserved = await tryReserveSend(pool, tenant.id, "acct-1", 750);
    expect(reserved).toBe(true);

    const rows = await pool.query("select count(*)::int as count from account_sends where instagram_account_id = $1", [
      "acct-1",
    ]);
    expect(rows.rows[0].count).toBe(1);
  });

  it("refuses and records nothing once the limit is reached", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    const reserved = await tryReserveSend(pool, tenant.id, "acct-1", 1);
    expect(reserved).toBe(true);

    const second = await tryReserveSend(pool, tenant.id, "acct-1", 1);
    expect(second).toBe(false);

    const rows = await pool.query("select count(*)::int as count from account_sends where instagram_account_id = $1", [
      "acct-1",
    ]);
    expect(rows.rows[0].count).toBe(1); // the refused attempt recorded nothing
  });

  // The regression this exists for: N concurrent reservations racing
  // against the same limit must never let more than `limit` of them win —
  // a check-then-act pair (count, then insert) can't guarantee that under
  // real concurrency, which is exactly why this is one atomic statement.
  it("under concurrent calls, exactly `limit` reservations succeed, never more", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const limit = 5;

    const results = await Promise.all(
      Array.from({ length: 20 }, () => tryReserveSend(pool, tenant.id, "acct-1", limit)),
    );

    expect(results.filter(Boolean).length).toBe(limit);

    const rows = await pool.query("select count(*)::int as count from account_sends where instagram_account_id = $1", [
      "acct-1",
    ]);
    expect(rows.rows[0].count).toBe(limit);
  });
});

describe("pruneOldSends (R6-06)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table account_sends");
  });

  afterAll(async () => {
    await closePool();
  });

  it("deletes sends older than the cutoff, leaves recent ones", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await tryReserveSend(pool, tenant.id, "acct-old", 100);
    await tryReserveSend(pool, tenant.id, "acct-recent", 100);
    await pool.query(`update account_sends set sent_at = now() - interval '48 hours' where instagram_account_id = $1`, [
      "acct-old",
    ]);

    const deleted = await pruneOldSends(pool, 24);
    expect(deleted).toBe(1);

    const remaining = await pool.query("select instagram_account_id from account_sends");
    expect(remaining.rows.map((r) => r.instagram_account_id)).toEqual(["acct-recent"]);
  });
});
