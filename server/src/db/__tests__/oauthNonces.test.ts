import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { pruneExpiredNonces, trySpendNonce } from "../oauthNonces.js";

// R5-03: spent_oauth_nonces has no other cleanup path — a nonce is only
// ever useful for the OAuth state's own 10-minute validity window, so
// anything older than a generous multiple of that is safe to delete.
describe("pruneExpiredNonces (R5-03)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    // resetDb doesn't cascade here — spent_oauth_nonces has no FK to
    // anything it truncates — so it needs clearing explicitly.
    await getPool().query("truncate table spent_oauth_nonces");
  });

  afterAll(async () => {
    await closePool();
  });

  it("deletes nonces spent longer ago than the cutoff, leaves recent ones", async () => {
    const pool = getPool();
    await trySpendNonce(pool, "old-nonce");
    await trySpendNonce(pool, "recent-nonce");
    await pool.query(`update spent_oauth_nonces set spent_at = now() - interval '48 hours' where nonce = $1`, [
      "old-nonce",
    ]);

    const deleted = await pruneExpiredNonces(pool, 24);
    expect(deleted).toBe(1);

    const remaining = await pool.query("select nonce from spent_oauth_nonces");
    expect(remaining.rows.map((r) => r.nonce)).toEqual(["recent-nonce"]);
  });

  it("returns 0 when nothing is old enough to prune", async () => {
    const pool = getPool();
    await trySpendNonce(pool, "fresh-nonce");
    expect(await pruneExpiredNonces(pool, 24)).toBe(0);
  });
});
