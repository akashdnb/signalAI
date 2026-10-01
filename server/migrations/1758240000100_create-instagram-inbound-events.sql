-- Up Migration
--
-- Stores inbound Instagram webhook events.
-- provider_event_id provides idempotency across webhook retries.
-- No access token is stored here.

create table instagram_inbound_events (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references tenants(id)
    on delete cascade,

  instagram_account_id uuid not null
    references instagram_accounts(id)
    on delete cascade,

  provider_event_id text not null,

  -- Sender/conversation participant.
  instagram_user_id text not null,

  event_type text not null,

  message_text text,

  event_at timestamptz,

  payload jsonb not null,

  journey_execution_id uuid
    references journey_executions(id)
    on delete set null,

  status text not null default 'received'
    check (
      status in (
        'received',
        'processed',
        'ignored',
        'failed'
      )
    ),

  created_at timestamptz not null default now(),

  processed_at timestamptz,

  constraint instagram_inbound_events_provider_event_unique
    unique (
      tenant_id,
      provider_event_id
    )
);

create index instagram_inbound_events_account_idx
  on instagram_inbound_events (
    instagram_account_id,
    created_at desc
  );

create index instagram_inbound_events_subject_idx
  on instagram_inbound_events (
    tenant_id,
    instagram_user_id,
    created_at desc
  );

create index instagram_inbound_events_execution_idx
  on instagram_inbound_events (
    journey_execution_id
  );
