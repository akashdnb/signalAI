import type { Pool } from "pg";

/**
 * Atomically marks a nonce spent and reports whether it was already spent
 * — a single INSERT with ON CONFLICT DO NOTHING is race-safe (two
 * simultaneous requests for the same nonce can't both "win"), which a
 * separate check-then-insert wouldn't be.
 */
export async function trySpendNonce(pool: Pool, nonce: string): Promise<boolean> {
  const result = await pool.query(
    `insert into spent_oauth_nonces (nonce) values ($1) on conflict (nonce) do nothing`,
    [nonce],
  );
  return result.rowCount === 1;
}

/**
 * R5-03 fix: a spent nonce is only ever useful for the OAuth state's own
 * 10-minute validity window (see lib/oauthState.ts) — past that, the row
 * exists purely to make the table the largest one in the database within
 * a year. Called once at boot, same pattern as sweepWedgedLeadEventJobs;
 * a generous multiple of the state lifetime keeps this safe even across a
 * long deploy gap.
 */
export async function pruneExpiredNonces(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(
    `delete from spent_oauth_nonces where spent_at < now() - ($1 || ' hours')::interval`,
    [olderThanHours],
  );
  return result.rowCount ?? 0;
}
