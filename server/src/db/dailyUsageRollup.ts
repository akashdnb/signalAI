import type { Pool } from "pg";

export interface DailyUsageRollup {
  id: string;
  tenantId: string;
  usageDate: string;
  promptTokens: number;
  completionTokens: number;
  syncedToStripeAt: Date | null;
}

interface RollupRow {
  id: string;
  tenant_id: string;
  usage_date: string;
  prompt_tokens: string;
  completion_tokens: string;
  synced_to_stripe_at: Date | null;
}

function toRollup(row: RollupRow): DailyUsageRollup {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    usageDate: row.usage_date,
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    syncedToStripeAt: row.synced_to_stripe_at,
  };
}

/** Upserts one tenant's totals for one day — called once per tenant per rollup run, so a plain upsert (not an increment) is correct: it always sets the day's total from token_usage, it never adds to a partial figure. */
export async function upsertDailyUsageRollup(
  pool: Pool,
  params: { tenantId: string; usageDate: string; promptTokens: number; completionTokens: number },
): Promise<DailyUsageRollup> {
  const result = await pool.query<RollupRow>(
    `insert into daily_usage_rollup (tenant_id, usage_date, prompt_tokens, completion_tokens)
     values ($1, $2, $3, $4)
     on conflict (tenant_id, usage_date) do update set
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens
     returning *`,
    [params.tenantId, params.usageDate, params.promptTokens, params.completionTokens],
  );
  return toRollup(result.rows[0]!);
}

/** What the Stripe sync step still needs to report — never re-queries an already-synced day, so a partial outage only retries what actually failed. */
export async function listUnsyncedRollups(pool: Pool, limit = 500): Promise<DailyUsageRollup[]> {
  const result = await pool.query<RollupRow>(
    `select * from daily_usage_rollup where synced_to_stripe_at is null order by usage_date limit $1`,
    [limit],
  );
  return result.rows.map(toRollup);
}

export async function markRollupSynced(pool: Pool, id: string): Promise<void> {
  await pool.query(`update daily_usage_rollup set synced_to_stripe_at = now() where id = $1`, [id]);
}
