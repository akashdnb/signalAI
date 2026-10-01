-- Up Migration

alter table journey_actions
  add column claimed_at timestamptz;

alter table journey_actions
  drop constraint if exists journey_actions_status_check;

alter table journey_actions
  add constraint journey_actions_status_check
  check (
    status in ('pending', 'processing', 'acknowledged')
  );

create index journey_actions_processing_claimed_idx
  on journey_actions (claimed_at)
  where status = 'processing';


-- Down Migration

drop index if exists journey_actions_processing_claimed_idx;

alter table journey_actions
  drop constraint if exists journey_actions_status_check;

alter table journey_actions
  add constraint journey_actions_status_check
  check (
    status in ('pending', 'acknowledged')
  );

alter table journey_actions
  drop column if exists claimed_at;
