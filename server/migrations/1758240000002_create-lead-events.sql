-- Up Migration
-- The durable event pipeline's source of truth (roadmap Phase 1 Platform
-- Foundations): structural facts only, never PII — see lead_pii below for
-- the content split. Unique on meta_event_id so a webhook retry is a no-op.
create table lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),

  meta_event_id text not null,
  event_type text not null,

  -- Meta's own event timestamp. Display/attribution ordering (Lead Timeline,
  -- first/last-touch) sorts on this at read time and needs nothing else.
  occurred_at timestamptz not null,

  -- Ingestion-assigned per-lead ordering sequence (pg-boss key_strict_fifo
  -- processes in this order). Compared against leads.last_applied_sequence
  -- before a worker applies any state-mutating side effect.
  sequence bigint not null,

  -- Non-PII structural attributes only (e.g. campaign_id, matched_keyword).
  -- Comment/DM text, username, phone never go here — see lead_pii.
  attributes jsonb not null default '{}',

  created_at timestamptz not null default now()
);

create unique index lead_events_meta_event_id_idx on lead_events (meta_event_id);
create index lead_events_lead_id_sequence_idx on lead_events (lead_id, sequence);
create index lead_events_tenant_id_idx on lead_events (tenant_id);

-- Down Migration
drop table lead_events;
