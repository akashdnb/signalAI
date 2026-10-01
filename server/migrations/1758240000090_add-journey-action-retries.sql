-- Up Migration

alter table journey_actions
  add column attempt_count integer not null default 0;

alter table journey_actions
  add column next_attempt_at timestamptz;

alter table journey_actions
  add column last_error jsonb;

alter table journey_actions
  add constraint journey_actions_attempt_count_check
  check (attempt_count >= 0);

create index journey_actions_retry_idx
  on journey_actions (next_attempt_at, created_at)
  where status = 'pending';

-- Down Migration

drop index if exists journey_actions_retry_idx;

alter table journey_actions
  drop constraint if exists journey_actions_attempt_count_check;

alter table journey_actions
  drop column if exists last_error;

alter table journey_actions
  drop column if exists next_attempt_at;

alter table journey_actions
  drop column if exists attempt_count;
