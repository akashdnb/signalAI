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

export async function recordAiCall(pool: Pool, tenantId: string, instagramAccountId: string): Promise<void> {
  await pool.query(`insert into ai_call_usage (tenant_id, instagram_account_id) values ($1, $2)`, [
    tenantId,
    instagramAccountId,
  ]);
}
