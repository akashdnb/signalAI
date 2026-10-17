-- Up Migration
create table execution_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  idempotency_key text not null,
  correlation_id text not null,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index execution_jobs_claim_idx
  on execution_jobs (status, available_at, created_at)
  where status = 'queued';

create index execution_jobs_tenant_idx
  on execution_jobs (tenant_id, created_at desc);

-- Down Migration
drop table execution_jobs;
