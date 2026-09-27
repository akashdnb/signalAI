import type { Queryable } from "./types.js";

/**
 * Phase 2B Per-Tenant Usage Ledger. `on conflict do nothing` on
 * lead_event_id is the idempotency guarantee: a worker retry that re-runs
 * a reply whose usage was already recorded (job succeeded, then failed on
 * a LATER step before the job itself committed as done) is a silent no-op
 * here rather than a double-billed row. Absent usage (a provider that
 * didn't report token counts) means nothing to record — the caller checks
 * for that before calling this, it isn't a valid zero-token call.
 */
export async function recordTokenUsage(
  pool: Queryable,
  params: { tenantId: string; leadEventId: string; promptTokens: number; completionTokens: number },
): Promise<void> {
  await pool.query(
    `insert into token_usage (tenant_id, lead_event_id, prompt_tokens, completion_tokens)
     values ($1, $2, $3, $4)
     on conflict (lead_event_id) do nothing`,
    [params.tenantId, params.leadEventId, params.promptTokens, params.completionTokens],
  );
}

export interface TenantTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Cumulative usage for a tenant since a given point in time — the trial guard sums since trial_started_at; the billing-cycle dashboard sums since the start of the current calendar month. */
export async function getTokenUsageSince(pool: Queryable, tenantId: string, since: Date): Promise<TenantTokenUsage> {
  const result = await pool.query<{ prompt_tokens: string | null; completion_tokens: string | null }>(
    `select coalesce(sum(prompt_tokens), 0) as prompt_tokens, coalesce(sum(completion_tokens), 0) as completion_tokens
     from token_usage
     where tenant_id = $1 and called_at >= $2`,
    [tenantId, since],
  );
  const promptTokens = Number(result.rows[0]!.prompt_tokens ?? 0);
  const completionTokens = Number(result.rows[0]!.completion_tokens ?? 0);
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

/** Per-tenant, per-day totals for a date range — what the rollup job aggregates into daily_usage_rollup. */
export async function getDailyTokenTotals(
  pool: Queryable,
  date: string, // 'YYYY-MM-DD', interpreted in UTC
): Promise<Array<{ tenantId: string; promptTokens: number; completionTokens: number }>> {
  // `called_at at time zone 'UTC'` converts the timestamptz to UTC
  // wall-clock time before comparing against $1::date — comparing the raw
  // timestamptz against a date literal instead implicitly casts through
  // the SESSION's timezone (Postgres, not this app, decides what that is;
  // it is not necessarily UTC), which silently shifted the day boundary
  // and dropped rows whenever the session timezone wasn't UTC.
  const result = await pool.query<{ tenant_id: string; prompt_tokens: string; completion_tokens: string }>(
    `select tenant_id, sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens
     from token_usage
     where (called_at at time zone 'UTC') >= $1::date and (called_at at time zone 'UTC') < $1::date + interval '1 day'
     group by tenant_id`,
    [date],
  );
  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
  }));
}
