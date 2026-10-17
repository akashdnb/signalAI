-- Up Migration
-- Durable idempotency and audit data for authenticated MCP capability operations.
create table if not exists mcp_capability_idempotency (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  principal_id text not null,
  client_id text not null,
  operation text not null,
  idempotency_key_hash text not null,
  input_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, principal_id, client_id, operation, idempotency_key_hash)
);
create index if not exists mcp_capability_idempotency_created_idx
  on mcp_capability_idempotency(created_at);

create table if not exists mcp_capability_audit (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  principal_id text not null,
  client_id text not null,
  operation text not null,
  automation_id uuid,
  correlation_id text not null,
  idempotency_key_hash text not null,
  previous_version integer,
  new_version integer,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists mcp_capability_audit_tenant_created_idx
  on mcp_capability_audit(tenant_id, created_at desc);
create index if not exists mcp_capability_audit_automation_idx
  on mcp_capability_audit(automation_id, created_at desc);

alter table campaigns add column if not exists mcp_metadata jsonb not null default '{}'::jsonb;

-- Down Migration
alter table campaigns drop column if exists mcp_metadata;
drop table if exists mcp_capability_audit;
drop table if exists mcp_capability_idempotency;
