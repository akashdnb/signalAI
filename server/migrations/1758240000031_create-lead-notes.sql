-- Up Migration
-- Phase 2A "Lead Notes" / "Internal Comments" — a plain append-only record,
-- not a projection, so unlike leads' own columns there's nothing to derive
-- it from. author_user_id is nullable so a note survives the author's user
-- row being deleted later (Phase 9 account deletion) without cascading.
create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  author_user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index lead_notes_lead_id_idx on lead_notes (lead_id, created_at);

-- Down Migration
drop table lead_notes;
