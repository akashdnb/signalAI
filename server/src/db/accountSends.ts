import type { Pool } from "pg";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour — Meta's binding ceiling is hourly, not per-second

// R8-02: an arbitrary, fixed namespace for this module's advisory locks —
// scoping by (namespace, hashtext(account_id)) instead of hashtext(account_id)
// alone means this lock key space can never collide with an advisory lock
// taken elsewhere in the app for an unrelated purpose. hashtext() collisions
// BETWEEN two different account ids remain possible (it's a 32-bit hash) —
// harmless here since the lock is only ever held for one fast statement,
// so a collision just serializes two unrelated accounts' reservations
// against each other rather than causing incorrect behavior.
const ADVISORY_LOCK_NAMESPACE = 771_001;

/** Phase 2B Usage Visibility Dashboard: DMs sent this billing cycle, tenant-scoped (not per-account — a tenant's quota is tenant-wide even if they connect more than one account under Growth). */
export async function countSendsSince(pool: Pool, tenantId: string, since: Date): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from account_sends where tenant_id = $1 and sent_at >= $2`,
    [tenantId, since],
  );
  return Number(result.rows[0]!.count);
}

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
 * Reservation and recording are the same statement, done BEFORE the send.
 * Calling this counts as "sent" even if the send that follows then fails —
 * an accepted, and cheap, over-count (one wasted slot) against the
 * alternative of double-sending a lead a message it already got.
 *
 * R7-01 fix: `insert ... select ... where (count) < limit` alone is NOT
 * atomic under Postgres' default READ COMMITTED — each statement reads
 * `count(*)` against its own snapshot and nothing locks the counted rows,
 * so two truly concurrent callers can both observe `count < limit` and
 * both insert. A transaction-scoped advisory lock keyed by the account id
 * (`pg_advisory_xact_lock`, released automatically at commit/rollback)
 * forces callers for the SAME account to serialize around the
 * count-and-insert, which is what actually makes "two concurrent callers
 * cannot both win the same slot" true rather than merely narrowing the
 * race window. Different accounts take different lock keys and never
 * contend with each other.
 */
export async function tryReserveSend(
  pool: Pool,
  tenantId: string,
  instagramAccountId: string,
  hourlyLimit: number,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1, hashtext($2))", [
      ADVISORY_LOCK_NAMESPACE,
      instagramAccountId,
    ]);
    const result = await client.query(
      `insert into account_sends (tenant_id, instagram_account_id)
       select $1, $2
       where (
         select count(*) from account_sends
         where instagram_account_id = $2 and sent_at > now() - ($3 || ' milliseconds')::interval
       ) < $4
       returning id`,
      [tenantId, instagramAccountId, RATE_LIMIT_WINDOW_MS, hourlyLimit],
    );
    await client.query("commit");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * R6-06 originally added this to prune rows older than the rate-limit
 * window, on the reasoning that the table is "only ever queried over the
 * last hour." That stopped being true once B11 needed a durable "DMs
 * sent" analytics number sourced from this same table (see
 * src/db/analytics.ts) — pruning it would make the dashboard wrong, not
 * just save space. Left unused by the boot/maintenance sweeps for that
 * reason; kept in case an operator ever wants to run a manual archive
 * pass once analytics gets its own warehouse export.
 */
export async function pruneOldSends(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(`delete from account_sends where sent_at < now() - ($1 || ' hours')::interval`, [
    olderThanHours,
  ]);
  return result.rowCount ?? 0;
}
