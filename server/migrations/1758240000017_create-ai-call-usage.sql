-- Up Migration
-- B10: hard per-account AI spend ceiling. One row per actual LLM call
-- (rule-based replies never reach this table) — counting calls rather
-- than tokens is enough to bound worst-case spend given max_tokens is
-- already capped per call (R2-03), and it needs no cooperation from the
-- provider response shape the way token accounting would.
create table ai_call_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  instagram_account_id text not null,
  called_at timestamptz not null default now()
);
create index ai_call_usage_account_window_idx on ai_call_usage (instagram_account_id, called_at);

-- Down Migration
drop table ai_call_usage;
