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

export async function recordSend(pool: Pool, tenantId: string, instagramAccountId: string): Promise<void> {
  await pool.query(`insert into account_sends (tenant_id, instagram_account_id) values ($1, $2)`, [
    tenantId,
    instagramAccountId,
  ]);
}
