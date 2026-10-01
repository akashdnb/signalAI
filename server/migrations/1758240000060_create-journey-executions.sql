-- Up Migration
--
-- Runtime state is always pinned to one immutable published journey version.
-- The draft graph is never used directly by the runtime.

create table journey_executions (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references tenants(id),
  campaign_id uuid not null references campaigns(id),

  published_journey_version_id uuid not null
    references campaign_journey_versions(id),

  published_version integer not null,

  -- External identity of the person/conversation.
  -- We deliberately do not FK this yet because Instagram conversation
  -- identity will be integrated in the next runtime phase.
  subject_key text not null,

  status text not null default 'running'
    check (
      status in (
        'running',
        'waiting',
        'handoff',
        'completed',
        'failed'
      )
    ),

  current_node_id text,

  -- Runtime context accumulated while traversing the journey.
  context jsonb not null default '{}'::jsonb,

  -- Action waiting to be consumed by an external integration.
  pending_action jsonb,

  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint journey_execution_version_consistency
    check (published_version > 0)
);

create index journey_executions_subject_idx
  on journey_executions (
    tenant_id,
    campaign_id,
    subject_key,
    updated_at desc
  );

create index journey_executions_status_idx
  on journey_executions (
    tenant_id,
    status,
    updated_at desc
  );

create index journey_executions_published_version_idx
  on journey_executions (
    published_journey_version_id
  );

create table journey_node_executions (
  id uuid primary key default gen_random_uuid(),

  execution_id uuid not null
    references journey_executions(id)
    on delete cascade,

  node_id text not null,

  node_type text not null,

  status text not null
    check (
      status in (
        'started',
        'waiting',
        'completed',
        'failed'
      )
    ),

  input jsonb,
  output jsonb,
  error jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index journey_node_executions_execution_idx
  on journey_node_executions (
    execution_id,
    started_at
  );

create index journey_node_executions_node_idx
  on journey_node_executions (
    execution_id,
    node_id
  );

-- Down Migration

drop table journey_node_executions;
drop table journey_executions;
