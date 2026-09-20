import { createHmac, randomInt } from "node:crypto";
import type { Pool } from "pg";
import { normalizeEmail } from "./users.js";

const CODE_TTL_MS = 10 * 60 * 1000; // short-lived — this is a login credential, not a session
export const MAX_OTP_ATTEMPTS = 5;

/**
 * HMAC keyed on the session secret, not a bare hash — same rationale as
 * spent_oauth_nonces/the token vault (a DB read alone must never be enough
 * to log in as someone), but load-bearing here in a way it wasn't for the
 * magic-link token: a 6-digit code has only 1,000,000 possible values, so
 * a bare sha256 of a leaked table would be a rainbow-table lookup, not a
 * brute force. Keying it on a secret the DB itself doesn't hold closes
 * that. `email` is mixed into the message so the same code for two
 * different emails doesn't hash the same.
 */
function hashCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Returns the RAW code (for the emailed message) — never persisted or
 * logged; only its HMAC lands in the database. Invalidates this email's
 * previous unused codes first, so a person who requests a second code
 * can't be confused by an old one still sitting in their inbox as "valid".
 */
export async function createOtpCode(pool: Pool, secret: string, email: string, ip: string | null): Promise<string> {
  const normalized = normalizeEmail(email);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await pool.query(`update email_otp_codes set used_at = now() where email = $1 and used_at is null`, [normalized]);
  await pool.query(
    `insert into email_otp_codes (email, code_hash, ip, expires_at) values ($1, $2, $3, $4)`,
    [normalized, hashCode(secret, normalized, code), ip, expiresAt],
  );
  return code;
}

/**
 * Atomically spends a code and reports whether it was valid — a single
 * `update ... where used_at is null and expires_at > now() and
 * attempt_count < max returning` combines "exists, unexpired, unused, not
 * locked out" and "mark used" into one race-safe statement (same shape as
 * `spendMagicLinkToken`/`trySpendNonce`).
 */
export async function trySpendOtpCode(
  pool: Pool,
  secret: string,
  email: string,
  code: string,
  maxAttempts: number = MAX_OTP_ATTEMPTS,
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const result = await pool.query(
    `update email_otp_codes set used_at = now()
     where email = $1 and code_hash = $2 and used_at is null and expires_at > now() and attempt_count < $3
     returning id`,
    [normalized, hashCode(secret, normalized, code), maxAttempts],
  );
  return (result.rowCount ?? 0) > 0;
}

export type FailedOtpAttemptResult = "locked" | "no_active_code" | "attempt_recorded";

/**
 * Called after a wrong guess to advance the brute-force counter on
 * whichever code is currently active for this email — independent of the
 * per-email/per-IP request-rate limit below, which only bounds how many
 * codes get ISSUED, not how many guesses one held code can absorb.
 * Check-then-act against a single row, not fully atomic under two
 * concurrent wrong guesses (same tolerated-race class as
 * countRecentTokensForEmail was for magic links) — worst case one extra
 * guess slips through, not an authentication bypass, since the code
 * itself still has to match.
 */
export async function recordFailedOtpAttempt(
  pool: Pool,
  email: string,
  maxAttempts: number = MAX_OTP_ATTEMPTS,
): Promise<FailedOtpAttemptResult> {
  const result = await pool.query<{ attempt_count: number }>(
    `update email_otp_codes set attempt_count = attempt_count + 1
     where id = (
       select id from email_otp_codes
       where email = $1 and used_at is null and expires_at > now()
       order by created_at desc
       limit 1
     )
     returning attempt_count`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return "no_active_code";
  return row.attempt_count >= maxAttempts ? "locked" : "attempt_recorded";
}

/**
 * Rate limiting for `POST /auth/email/request`, per email and (separately)
 * per IP — same check-then-insert, low-severity-race shape as the magic
 * link tokens it replaces: the credential this gates is still single-use,
 * short-lived, and attempt-capped regardless of how many get issued.
 */
export async function countRecentCodesForEmail(pool: Pool, email: string, windowMs: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from email_otp_codes
     where email = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [normalizeEmail(email), windowMs],
  );
  return Number(result.rows[0]!.count);
}

export async function countRecentCodesForIp(pool: Pool, ip: string, windowMs: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from email_otp_codes
     where ip = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [ip, windowMs],
  );
  return Number(result.rows[0]!.count);
}

/** Scanned on every `/auth/email/request` (the rate-limit counts above) — same fastest-growing-and-most-read shape magic_link_tokens had, so it gets the same prune treatment. */
export async function pruneExpiredOtpCodes(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(`delete from email_otp_codes where created_at < now() - ($1 || ' hours')::interval`, [
    olderThanHours,
  ]);
  return result.rowCount ?? 0;
}
