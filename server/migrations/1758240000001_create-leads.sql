-- Up Migration
-- The cross-channel identity spine (roadmap Phase 1 Platform Foundations):
-- lead_id is minted once, at first contact, and channel handles hang off it
-- as columns. instagram_user_id is Phase 1's only handle; Phase 3 adds
-- whatsapp_phone the same way rather than creating a second lead.
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  instagram_user_id text,

  -- Milestone Engine state: position, not a graph traversal.
  active_milestone_id text,

  -- Messaging-window state machine: validated before every outbound send.
  last_inbound_at timestamptz,
  window_open_until timestamptz,

  -- Per-lead event ordering frontier (pg-boss key_strict_fifo, singletonKey = lead_id).
  -- Events older than this are logged but produce no state-mutating side effects.
  last_applied_sequence bigint not null default 0,

  created_at timestamptz not null default now()
);

create unique index leads_tenant_instagram_user_idx
  on leads (tenant_id, instagram_user_id)
  where instagram_user_id is not null;

create index leads_tenant_id_idx on leads (tenant_id);

-- Down Migration
drop table leads;
