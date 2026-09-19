import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  createMagicLinkToken,
  spendMagicLinkToken,
  countRecentTokensForEmail,
  countRecentTokensForIp,
  pruneExpiredMagicLinkTokens,
} from "../magicLinkTokens.js";

describe("magicLinkTokens", () => {
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

  it("spends a freshly-created token exactly once", async () => {
    const pool = getPool();
    const token = await createMagicLinkToken(pool, "A@Example.com", "1.2.3.4");

    const first = await spendMagicLinkToken(pool, token);
    expect(first?.email).toBe("a@example.com"); // normalized on write

    const second = await spendMagicLinkToken(pool, token);
    expect(second).toBeNull(); // already used
  });

  it("never persists the raw token — only its hash", async () => {
    const pool = getPool();
    const token = await createMagicLinkToken(pool, "a@example.com", null);
    const rows = await pool.query("select token_hash from magic_link_tokens");
    expect(rows.rows[0].token_hash).not.toBe(token);
  });

  it("rejects an expired token even though it was never used", async () => {
    const pool = getPool();
    const token = await createMagicLinkToken(pool, "a@example.com", null);
    await pool.query("update magic_link_tokens set expires_at = now() - interval '1 minute'");

    expect(await spendMagicLinkToken(pool, token)).toBeNull();
  });

  it("rejects a token that was never issued", async () => {
    const pool = getPool();
    expect(await spendMagicLinkToken(pool, "not-a-real-token")).toBeNull();
  });

  it("counts recent tokens per email and per IP independently", async () => {
    const pool = getPool();
    await createMagicLinkToken(pool, "a@example.com", "1.1.1.1");
    await createMagicLinkToken(pool, "a@example.com", "1.1.1.1");
    await createMagicLinkToken(pool, "b@example.com", "1.1.1.1");

    expect(await countRecentTokensForEmail(pool, "a@example.com", 60 * 60 * 1000)).toBe(2);
    expect(await countRecentTokensForEmail(pool, "A@EXAMPLE.COM", 60 * 60 * 1000)).toBe(2); // case-insensitive
    expect(await countRecentTokensForIp(pool, "1.1.1.1", 60 * 60 * 1000)).toBe(3);
    expect(await countRecentTokensForIp(pool, "9.9.9.9", 60 * 60 * 1000)).toBe(0);
  });

  it("does not count tokens outside the window", async () => {
    const pool = getPool();
    await createMagicLinkToken(pool, "a@example.com", null);
    await pool.query("update magic_link_tokens set created_at = now() - interval '2 hours'");

    expect(await countRecentTokensForEmail(pool, "a@example.com", 60 * 60 * 1000)).toBe(0);
  });

  // R14-04: this table is scanned on every /auth/email/request, so unlike
  // spent_oauth_nonces/ai_call_usage it needs to be gone, not merely old.
  it("prunes tokens older than the cutoff, used or not, and leaves recent ones", async () => {
    const pool = getPool();
    const oldToken = await createMagicLinkToken(pool, "old@example.com", null);
    await spendMagicLinkToken(pool, oldToken); // used doesn't exempt it
    await pool.query("update magic_link_tokens set created_at = now() - interval '48 hours' where email = 'old@example.com'");

    await createMagicLinkToken(pool, "recent@example.com", null);

    const pruned = await pruneExpiredMagicLinkTokens(pool, 24);
    expect(pruned).toBe(1);

    const rows = await pool.query("select email from magic_link_tokens");
    expect(rows.rows.map((r) => r.email)).toEqual(["recent@example.com"]);
  });
});
