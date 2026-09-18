import type { Pool } from "pg";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour — Meta's binding ceiling is hourly, not per-second

export async function countRecentSends(pool: Pool, instagramAccountId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from account_sends
     where instagram_account_id = $1 and sent_at > now() - ($2 || ' milliseconds')::interval`,
    [instagramAccountId, RATE_LIMIT_WINDOW_MS],
  );
  return Number(result.rows[0]!.count);
}

/**
 * R6-02/R6-03 fix: the previous shape was `countRecentSends` (check) then,
 * after the LLM call and the send, a separate `recordSend` (act) — a
 * classic check-then-act race, and `key_strict_fifo` runs different leads
 * on the *same* account concurrently by design, so N workers could each
 * read a count under the limit and each send. It also recorded the send
 * only after `sendInstagramMessage` succeeded, so a crash between send and
 * record left a DM the lead already received uncounted and unprotected
 * against a retry re-sending it.
 *
 * This makes reservation and recording the same atomic statement, done
 * BEFORE the send: `insert ... select ... where (count) < limit` only
 * inserts (and only returns a row) when a slot is actually available,
 * so two concurrent callers cannot both win the same slot. Calling this
 * counts as "sent" even if the send that follows then fails — an
 * accepted, and cheap, over-count (one wasted slot) against the
 * alternative of double-sending a lead a message it already got.
 */
export async function tryReserveSend(
  pool: Pool,
  tenantId: string,
  instagramAccountId: string,
  hourlyLimit: number,
): Promise<boolean> {
  const result = await pool.query(
    `insert into account_sends (tenant_id, instagram_account_id)
     select $1, $2
     where (
       select count(*) from account_sends
       where instagram_account_id = $2 and sent_at > now() - ($3 || ' milliseconds')::interval
     ) < $4
     returning id`,
    [tenantId, instagramAccountId, RATE_LIMIT_WINDOW_MS, hourlyLimit],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * R6-06 fix: same shape as R5-03's spent-nonce pruning — this table is
 * only ever queried over the last hour, so anything older is pure bloat.
 * Called once at boot alongside the other sweeps.
 */
export async function pruneOldSends(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(`delete from account_sends where sent_at < now() - ($1 || ' hours')::interval`, [
    olderThanHours,
  ]);
  return result.rowCount ?? 0;
}
