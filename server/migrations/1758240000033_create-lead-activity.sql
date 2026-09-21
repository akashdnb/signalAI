-- Up Migration
-- Phase 2A "Lead Activity History": a CRM-originated audit trail, kept
-- deliberately separate from lead_events. lead_events is specifically the
-- Meta-webhook-driven log the pg-boss FIFO worker processes in per-lead
-- order (see leads.ts/webhookIngestService.ts) — a dashboard action like
-- "notes added" or "pipeline stage changed" has no meta_event_id and needs
-- no worker to process it, it's just a fact to display. The Lead Timeline
-- (roadmap Phase 2A Lead Management) is the union of this table and
-- lead_events, sorted by timestamp at read time — same "sort at read time,
-- no shared ordering machinery needed" approach the roadmap already uses
-- for display/attribution ordering.
create table lead_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  actor_user_id uuid references users(id) on delete set null,
  type text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index lead_activity_lead_id_idx on lead_activity (lead_id, created_at);

-- Down Migration
drop table lead_activity;
