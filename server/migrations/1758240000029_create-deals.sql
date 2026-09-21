-- Up Migration
-- Phase 2A "deals table, schema now / UI later" amendment (roadmap Phase 2A
-- Data Model Amendments): Pipeline Management (migration 1758240000030)
-- tracks a lead's own status, but deal value/currency needs a first-class
-- record distinct from that status so revenue reporting (Phase 4) has
-- something to read without a retrofit.
create table deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  lead_id uuid not null references leads(id),
  stage text not null default 'open',
  value numeric(12, 2),
  currency text not null default 'USD',
  owner_user_id uuid references users(id) on delete set null,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  constraint deals_stage_check check (stage in ('open', 'won', 'lost'))
);

create index deals_tenant_id_idx on deals (tenant_id);
create index deals_lead_id_idx on deals (lead_id);

-- Down Migration
drop table deals;
