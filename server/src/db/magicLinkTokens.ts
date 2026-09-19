import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { normalizeEmail } from "./users.js";

const TOKEN_TTL_MS = 15 * 60 * 1000; // short-lived — this is a login credential, not a session

/** Only the hash is ever persisted — same shape as the token vault and spent_oauth_nonces: a DB read alone must never be enough to log in as someone. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the RAW token (for the emailed link) — never persisted or logged; only its hash lands in the database. */
export async function createMagicLinkToken(pool: Pool, email: string, ip: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(`insert into magic_link_tokens (email, token_hash, ip, expires_at) values ($1, $2, $3, $4)`, [
    normalizeEmail(email),
    hashToken(token),
    ip,
    expiresAt,
  ]);
  return token;
}

/**
 * Atomically spends a token and reports whether it was valid — a single
 * `update ... where used_at is null and expires_at > now() returning`
 * combines "exists, unexpired, unused" and "mark used" into one race-safe
 * statement (same shape as `trySpendNonce`), so two concurrent requests
 * for the same token can never both succeed.
 */
export async function spendMagicLinkToken(pool: Pool, token: string): Promise<{ email: string } | null> {
  const result = await pool.query<{ email: string }>(
    `update magic_link_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning email`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

/**
 * Rate limiting for `POST /auth/email/request`, per email and (separately)
 * per IP. Check-then-insert, not atomic — an acceptable, low-severity race
 * here: the credential this gates is still single-use and short-lived
 * regardless of how many get issued, so the worst case of a lost race is a
 * handful of extra emails sent, not an authentication bypass (unlike the
 * Instagram send-rate limiter, which guards a hard external ceiling and
 * was made atomic for that reason).
 */
export async function countRecentTokensForEmail(pool: Pool, email: string, windowMs: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from magic_link_tokens
     where email = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [normalizeEmail(email), windowMs],
  );
  return Number(result.rows[0]!.count);
}

export async function countRecentTokensForIp(pool: Pool, ip: string, windowMs: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from magic_link_tokens
     where ip = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [ip, windowMs],
  );
  return Number(result.rows[0]!.count);
}

/**
 * R14-04 fix: this is the newest tenant_id-less table and the one scanned
 * on every single `/auth/email/request` (the rate-limit counts above), so
 * unlike a table that's merely written often, an unpruned
 * magic_link_tokens is both the fastest-growing AND the most-read table —
 * same pattern as pruneExpiredNonces, called from the same maintenance
 * queue. The 1-hour rate-limit window never needs anything older than an
 * hour, so a day of slack is generous, not tight.
 */
export async function pruneExpiredMagicLinkTokens(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(
    `delete from magic_link_tokens where created_at < now() - ($1 || ' hours')::interval`,
    [olderThanHours],
  );
  return result.rowCount ?? 0;
}
