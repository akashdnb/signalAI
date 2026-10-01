alter table journey_actions
  drop constraint if exists journey_actions_status_check;

alter table journey_actions
  add constraint journey_actions_status_check
  check (status in ('pending', 'processing', 'acknowledged', 'failed'));
