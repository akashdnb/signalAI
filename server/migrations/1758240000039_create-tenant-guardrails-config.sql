-- Up Migration
-- Phase 2C Client Guardrails: configured at onboarding (brand voice,
-- forbidden topics, escalation triggers), layered on top of Phase 1's
-- Global Guardrails (lib/guardrails.ts) and can only NARROW them, never
-- override — this table is read-only input to that narrowing check, never
-- a way to disable it. One row per tenant; an absent row means "no
-- additional narrowing configured," never "guardrails disabled" (the
-- global checks in guardrails.ts take no configuration at all and always
-- run regardless of whether this row exists).
create table tenant_guardrails_config (
  tenant_id uuid primary key references tenants(id),
  brand_voice text,
  forbidden_topics jsonb not null default '[]',
  escalation_triggers jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Down Migration
drop table tenant_guardrails_config;
