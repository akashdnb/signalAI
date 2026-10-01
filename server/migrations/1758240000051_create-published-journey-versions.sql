-- Up Migration
--
-- Immutable snapshots of journeys that have been published.
-- builder_version remains the optimistic-concurrency version for the
-- editable draft. This table represents versions consumed by the
-- future journey runtime.

create table campaign_journey_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  campaign_id uuid not null references campaigns(id),
  version integer not null,
  graph jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),

  constraint campaign_journey_versions_campaign_version_unique
    unique (tenant_id, campaign_id, version)
);

create index campaign_journey_versions_campaign_idx
  on campaign_journey_versions (campaign_id, tenant_id, version desc);

-- Down Migration

drop table campaign_journey_versions;
