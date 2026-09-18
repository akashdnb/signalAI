-- Up Migration
-- Phase 1 Automation Engine: a campaign is a tenant's set of trigger
-- keywords. enabled *is* campaign status in Phase 1 (roadmap Campaign
-- Management note) — a separate status model is Phase 2A.
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  keywords text[] not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_tenant_enabled_idx on campaigns (tenant_id, enabled);

-- Records which campaign/keyword a comment matched, if any — non-PII
-- structural fact, alongside the other attributes already on this column.
comment on column lead_events.attributes is
  'Non-PII structural facts only (e.g. matchedCampaignId, matchedKeyword). Comment/DM text, username, phone never go here — see lead_pii.';

-- Down Migration
drop table campaigns;
