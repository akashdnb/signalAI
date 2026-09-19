import type { Pool } from "pg";

const CAP_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24h, same shape as accountSends.ts's send-rate window

export async function countRecentAiCalls(pool: Pool, instagramAccountId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::int as count from ai_call_usage
     where instagram_account_id = $1 and called_at > now() - ($2 || ' milliseconds')::interval`,
    [instagramAccountId, CAP_WINDOW_MS],
  );
  return Number(result.rows[0]!.count);
}

/** Returns the new row's id — needed so a failed (never-billed) call can be refunded via `deleteAiCallUsage` (R7-02). */
export async function recordAiCall(pool: Pool, tenantId: string, instagramAccountId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ai_call_usage (tenant_id, instagram_account_id) values ($1, $2) returning id`,
    [tenantId, instagramAccountId],
  );
  return result.rows[0]!.id;
}

/** R7-02: refunds a reservation whose provider call failed at the transport layer — that call was attempted, not completed/billed, so it shouldn't count against the cap. */
export async function deleteAiCallUsage(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from ai_call_usage where id = $1`, [id]);
}

/**
 * R7-04 fix: same shape as `pruneExpiredNonces`/`pruneOldSends` — only ever
 * read over a rolling 24h window, and read on every single AI reply, so
 * unbounded growth here is worse than its sibling tables, not just as bad.
 */
export async function pruneOldAiCallUsage(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(`delete from ai_call_usage where called_at < now() - ($1 || ' hours')::interval`, [
    olderThanHours,
  ]);
  return result.rowCount ?? 0;
}
