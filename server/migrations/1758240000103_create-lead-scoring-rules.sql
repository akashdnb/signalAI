-- Up Migration
-- Phase 2C Lead Intelligence: tenant-configurable custom scoring rules
-- (roadmap "Support configurable scoring rules without breaking the
-- deterministic base model").
--
-- `definition` is a structured, non-executable rule record (never a
-- tenant-authored expression/eval target) — one of two shapes, validated in
-- application code (db/leadScoringRules.ts):
--   {"kind": "field_compare", "field": "budget_value"|"intent"|"need"|"location",
--    "operator": "gte"|"lte"|"eq"|"exists", "value": number|string}
--   {"kind": "milestone_completed", "milestoneId": "<uuid>"}
--
-- `points` is its own column (not buried in the JSON) so it's visible to
-- anyone inspecting the table directly, and so a future "top rules by
-- impact" query doesn't need to unpack JSON to sort.

create table lead_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  name text not null,
  definition jsonb not null,
  points smallint not null
    check (points >= -100 and points <= 100),
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_scoring_rules_tenant_idx
  on lead_scoring_rules (tenant_id, enabled);

-- Down Migration
drop table lead_scoring_rules;
