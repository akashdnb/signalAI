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
