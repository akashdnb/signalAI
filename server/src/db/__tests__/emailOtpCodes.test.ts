import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  createOtpCode,
  trySpendOtpCode,
  recordFailedOtpAttempt,
  countRecentCodesForEmail,
  countRecentCodesForIp,
  pruneExpiredOtpCodes,
  MAX_OTP_ATTEMPTS,
} from "../emailOtpCodes.js";

const SECRET = "test-secret";

describe("emailOtpCodes", () => {
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

  it("spends a freshly-created code exactly once", async () => {
    const pool = getPool();
    const code = await createOtpCode(pool, SECRET, "A@Example.com", "1.2.3.4");

    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", code)).toBe(true); // normalized email
    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", code)).toBe(false); // already used
  });

  it("never persists the raw code — only its HMAC", async () => {
    const pool = getPool();
    const code = await createOtpCode(pool, SECRET, "a@example.com", null);
    const rows = await pool.query("select code_hash from email_otp_codes");
    expect(rows.rows[0].code_hash).not.toBe(code);
  });

  it("a code hashed for one secret does not verify against a different secret", async () => {
    const pool = getPool();
    const code = await createOtpCode(pool, SECRET, "a@example.com", null);
    expect(await trySpendOtpCode(pool, "a-different-secret", "a@example.com", code)).toBe(false);
  });

  it("rejects an expired code even though it was never used", async () => {
    const pool = getPool();
    const code = await createOtpCode(pool, SECRET, "a@example.com", null);
    await pool.query("update email_otp_codes set expires_at = now() - interval '1 minute'");

    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", code)).toBe(false);
  });

  it("rejects a code that was never issued", async () => {
    const pool = getPool();
    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", "000000")).toBe(false);
  });

  it("requesting a new code invalidates the previous one for that email", async () => {
    const pool = getPool();
    const firstCode = await createOtpCode(pool, SECRET, "a@example.com", null);
    await createOtpCode(pool, SECRET, "a@example.com", null);

    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", firstCode)).toBe(false);
  });

  it("locks out further guesses against the same code after MAX_OTP_ATTEMPTS wrong guesses", async () => {
    const pool = getPool();
    const code = await createOtpCode(pool, SECRET, "a@example.com", null);
    const wrongCode = code === "000000" ? "111111" : "000000";

    let lastResult;
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      lastResult = await recordFailedOtpAttempt(pool, "a@example.com");
    }
    expect(lastResult).toBe("locked");

    // Even the CORRECT code no longer spends once locked out.
    expect(await trySpendOtpCode(pool, SECRET, "a@example.com", code)).toBe(false);
  });

  it("recordFailedOtpAttempt reports no_active_code when nothing is outstanding", async () => {
    const pool = getPool();
    expect(await recordFailedOtpAttempt(pool, "nobody@example.com")).toBe("no_active_code");
  });

  it("counts recent codes per email and per IP independently", async () => {
    const pool = getPool();
    await createOtpCode(pool, SECRET, "a@example.com", "1.1.1.1");
    await createOtpCode(pool, SECRET, "a@example.com", "1.1.1.1");
    await createOtpCode(pool, SECRET, "b@example.com", "1.1.1.1");

    expect(await countRecentCodesForEmail(pool, "a@example.com", 60 * 60 * 1000)).toBe(2);
    expect(await countRecentCodesForEmail(pool, "A@EXAMPLE.COM", 60 * 60 * 1000)).toBe(2); // case-insensitive
    expect(await countRecentCodesForIp(pool, "1.1.1.1", 60 * 60 * 1000)).toBe(3);
    expect(await countRecentCodesForIp(pool, "9.9.9.9", 60 * 60 * 1000)).toBe(0);
  });

  it("does not count codes outside the window", async () => {
    const pool = getPool();
    await createOtpCode(pool, SECRET, "a@example.com", null);
    await pool.query("update email_otp_codes set created_at = now() - interval '2 hours'");

    expect(await countRecentCodesForEmail(pool, "a@example.com", 60 * 60 * 1000)).toBe(0);
  });

  it("prunes codes older than the cutoff, used or not, and leaves recent ones", async () => {
    const pool = getPool();
    const oldCode = await createOtpCode(pool, SECRET, "old@example.com", null);
    await trySpendOtpCode(pool, SECRET, "old@example.com", oldCode); // used doesn't exempt it
    await pool.query("update email_otp_codes set created_at = now() - interval '48 hours' where email = 'old@example.com'");

    await createOtpCode(pool, SECRET, "recent@example.com", null);

    const pruned = await pruneExpiredOtpCodes(pool, 24);
    expect(pruned).toBe(1);

    const rows = await pool.query("select email from email_otp_codes");
    expect(rows.rows.map((r) => r.email)).toEqual(["recent@example.com"]);
  });
});
