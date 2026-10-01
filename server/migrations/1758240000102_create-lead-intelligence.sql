-- Up Migration
-- Phase 2C Lead Intelligence Foundation.
--
-- lead_intelligence is the current, query-friendly projection used by the
-- dashboard and future scoring / qualification features.
--
-- Qualification fields are deliberately normalized here rather than
-- overloaded into lead_captured_facts:
--   intent   -> normalized intent/category
--   need     -> lead need / use-case summary
--   budget   -> normalized numeric value when available + raw text
--   location -> normalized location string
--
-- lead_captured_facts remains the generic tenant-defined source of truth.
-- This table is the derived intelligence projection.

create table lead_intelligence (
  lead_id uuid primary key references leads(id) on delete cascade,
  tenant_id uuid not null references tenants(id),

  intent text,
  need text,
  budget_value numeric,
  budget_text text,
  location text,

  score smallint not null default 0
    check (score >= 0 and score <= 100),

  score_band text not null default 'cold'
    check (score_band in ('cold', 'warm', 'hot', 'very_hot')),

  score_reasons jsonb not null default '[]',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_intelligence_tenant_score_idx
  on lead_intelligence (tenant_id, score desc);

create index lead_intelligence_tenant_band_idx
  on lead_intelligence (tenant_id, score_band);

-- Append-only scoring history.
-- We only write when the current projection materially changes so this does
-- not become one row per inbound event.

create table lead_intelligence_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),

  intent text,
  need text,
  budget_value numeric,
  budget_text text,
  location text,

  score smallint not null
    check (score >= 0 and score <= 100),

  score_band text not null
    check (score_band in ('cold', 'warm', 'hot', 'very_hot')),

  score_reasons jsonb not null default '[]',

  created_at timestamptz not null default now()
);

create index lead_intelligence_history_lead_idx
  on lead_intelligence_history (lead_id, created_at desc);

create index lead_intelligence_history_tenant_idx
  on lead_intelligence_history (tenant_id, created_at desc);

-- Down Migration
drop table lead_intelligence_history;
drop table lead_intelligence;
