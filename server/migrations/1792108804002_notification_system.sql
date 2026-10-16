-- Up Migration
-- Notification infrastructure: controlled event catalog, persisted user policy,
-- in-app inbox, idempotent event receipt, and per-channel delivery history.
-- Provider secrets and raw provider response bodies are deliberately not persisted.

create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  severity text not null default 'info',
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notification_events_severity_check
    check (severity in ('info', 'success', 'warning', 'critical')),
  constraint notification_events_type_check
    check (event_type in (
      'lead.created',
      'automation.execution_failed',
      'automation.execution_recovered',
      'instagram.connection_attention',
      'instagram.connection_disconnected',
      'system.operational_alert'
    )),
  unique (tenant_id, event_type, idempotency_key)
);
create index if not exists notification_events_tenant_created_idx
  on notification_events (tenant_id, created_at desc);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references notification_events(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  severity text not null,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists notifications_user_inbox_idx
  on notifications (tenant_id, user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on notifications (tenant_id, user_id, created_at desc)
  where read_at is null;

create table if not exists notification_preferences (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  channel text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, event_type, channel),
  constraint notification_preferences_event_type_check
    check (event_type in (
      'lead.created',
      'automation.execution_failed',
      'automation.execution_recovered',
      'instagram.connection_attention',
      'instagram.connection_disconnected',
      'system.operational_alert'
    )),
  constraint notification_preferences_channel_check
    check (channel in ('email', 'in_app'))
);
create index if not exists notification_preferences_user_idx
  on notification_preferences (tenant_id, user_id);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references notification_events(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  channel text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz,
  provider text,
  provider_message_id text,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check
    check (channel in ('email', 'in_app')),
  constraint notification_deliveries_status_check
    check (status in ('pending', 'processing', 'delivered', 'retrying', 'failed', 'disabled')),
  constraint notification_deliveries_attempts_check
    check (attempts >= 0 and max_attempts between 1 and 5),
  unique (event_id, recipient_user_id, channel)
);
create index if not exists notification_deliveries_due_idx
  on notification_deliveries (status, next_attempt_at)
  where status in ('pending', 'retrying');

-- Down Migration
drop table if exists notification_deliveries;
drop table if exists notification_preferences;
drop table if exists notifications;
drop table if exists notification_events;
