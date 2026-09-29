-- Up Migration
-- Workstream 2: tenant-level Field Definitions registry. milestoneEngine.ts's
-- isValidCapturedValue only has real regex validation for fields whose name
-- happens to contain "email"/"phone" — anything else (e.g. a milestone
-- capturing "user_country") just checks against a refusal-phrase set, so
-- "asdf" would pass. This table lets a tenant register a reusable field once
-- (key, label, value type) and get real per-type validation across all their
-- campaigns' milestones. No FK from campaign_milestones.capture_fields to
-- this table: capture_fields stays a plain text[] of key strings, and a
-- tenant can still use an unregistered/ad-hoc field name in a milestone — the
-- registry is optional, additive typing on top, not a hard requirement.
create table tenant_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  field_key text not null,
  label text not null,
  value_type text not null default 'text' check (value_type in ('email','phone','country','number','date','text')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, field_key)
);

-- Down Migration
drop table tenant_field_definitions;
