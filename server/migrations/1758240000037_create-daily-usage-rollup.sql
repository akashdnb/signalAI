-- Up Migration
-- Phase 2B "Daily Usage Rollup -> Stripe Metered Billing": aggregate
-- internally first, sync to Stripe periodically rather than calling it
-- per token event. One row per tenant per day; synced_to_stripe_at is
-- null until the daily rollup job (services/usageRollupService.ts)
-- successfully reports it to Stripe's metered-billing API — left null
-- (not retried-and-abandoned) on a Stripe failure, so the next run's
-- unsynced query picks it back up automatically.
create table daily_usage_rollup (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  usage_date date not null,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  synced_to_stripe_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index daily_usage_rollup_tenant_date_idx on daily_usage_rollup (tenant_id, usage_date);
create index daily_usage_rollup_unsynced_idx on daily_usage_rollup (usage_date) where synced_to_stripe_at is null;

-- Down Migration
drop table daily_usage_rollup;
