-- Up Migration
--
-- Runtime correctness layer:
-- 1. Exactly one active execution per tenant/campaign/subject.
-- 2. Stable inbound event idempotency.
-- 3. Explicit action acknowledgement.
--
-- The partial unique index only applies to executions which can still
-- receive runtime events.

create unique index journey_executions_active_subject_unique
  on journey_executions (
    tenant_id,
    campaign_id,
    subject_key
  )
  where status in ('running', 'waiting', 'handoff');


create table journey_events (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references tenants(id),

  execution_id uuid not null
    references journey_executions(id)
    on delete cascade,

  -- Stable external event identifier.
  --
  -- For Instagram this will eventually be the provider's stable
  -- webhook/message/event identifier.
  event_id text not null,

  event_type text not null,

  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint journey_events_tenant_event_unique
    unique (tenant_id, event_id)
);

create index journey_events_execution_idx
  on journey_events (
    execution_id,
    created_at
  );


create table journey_actions (
  id uuid primary key default gen_random_uuid(),

  execution_id uuid not null
    references journey_executions(id)
    on delete cascade,

  node_execution_id uuid
    references journey_node_executions(id)
    on delete set null,

  action_type text not null
    check (
      action_type in (
        'SEND_MESSAGE',
        'HANDOFF',
        'OPEN_ACTION_LINK'
      )
    ),

  payload jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'acknowledged'
      )
    ),

  created_at timestamptz not null default now(),

  acknowledged_at timestamptz
);

create unique index journey_actions_execution_node_type_unique
  on journey_actions (
    execution_id,
    node_execution_id,
    action_type
  );

create index journey_actions_pending_idx
  on journey_actions (
    execution_id,
    status,
    created_at
  );


-- Down Migration

drop table journey_actions;
drop table journey_events;

drop index journey_executions_active_subject_unique;
