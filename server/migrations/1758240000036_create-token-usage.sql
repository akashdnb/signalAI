-- Up Migration
-- Phase 2B Per-Tenant Usage Ledger: "LLM input/output tokens recorded per
-- AI call, keyed by the same idempotency key as the triggering event so a
-- retry can't double-bill." The triggering event is a lead_events row —
-- unique on lead_event_id, so a worker retry that re-runs a reply that
-- already recorded usage is a no-op insert (`on conflict do nothing` in
-- db/tokenUsage.ts), not a double-billed one. Distinct from ai_call_usage
-- (Phase 1's per-account spend ceiling): that table counts CALLS in a
-- rolling 24h window and is pruned; this one counts TOKENS, is never
-- pruned, and is the actual billing source of truth.
create table token_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_event_id uuid not null references lead_events(id),
  prompt_tokens integer not null,
  completion_tokens integer not null,
  called_at timestamptz not null default now()
);
create unique index token_usage_lead_event_id_idx on token_usage (lead_event_id);
create index token_usage_tenant_called_at_idx on token_usage (tenant_id, called_at);

-- Down Migration
drop table token_usage;
