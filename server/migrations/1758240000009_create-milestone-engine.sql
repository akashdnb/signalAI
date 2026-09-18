-- Up Migration
-- Milestone Engine (roadmap Phase 1 — "the thing competitors don't have").
-- A campaign's entire configuration surface: an ordered list of goals in
-- plain language, no flowchart. ordinal is the position; capture_field,
-- when set, names the typed fact this milestone extracts on satisfaction
-- (e.g. 'email', 'budget') — some milestones (e.g. "send pricing") just
-- advance the conversation and capture nothing.
create table campaign_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  campaign_id uuid not null references campaigns(id),
  ordinal int not null,
  goal_description text not null,
  capture_field text,
  created_at timestamptz not null default now(),
  unique (campaign_id, ordinal)
);

create index campaign_milestones_campaign_idx on campaign_milestones (campaign_id, ordinal);

-- Captured facts are lead-level, cumulative CRM state (once captured, they
-- persist across the whole conversation) — not tied to one event the way
-- lead_pii is, so they get their own table rather than living there. Still
-- PII-adjacent (email, phone, budget), so still erasable: soft-delete the
-- row, hard-scrub the facts jsonb, same pattern as lead_pii.
create table lead_captured_facts (
  lead_id uuid primary key references leads(id),
  tenant_id uuid not null references tenants(id),
  facts jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Append-only log for per-milestone drop-off (roadmap Milestone Analytics,
-- feeds Phase 4 Funnel Analytics) — how many leads reached ordinal N tells
-- a creator where the funnel actually leaks.
create table milestone_advancements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  campaign_id uuid not null references campaigns(id),
  milestone_id uuid not null references campaign_milestones(id),
  advanced_at timestamptz not null default now()
);

create index milestone_advancements_campaign_idx on milestone_advancements (campaign_id, milestone_id);

-- Down Migration
drop table milestone_advancements;
drop table lead_captured_facts;
drop table campaign_milestones;
