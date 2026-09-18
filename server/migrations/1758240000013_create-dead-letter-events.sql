-- Up Migration
-- R3-08 review fix: the DLQ handler deleted the source job to free the
-- singletonKey (correct — see R1-03), but that delete was also the only
-- record of what failed. A permanently-failed event used to end with its
-- evidence deleted and a console.error line as the sole trace. This table
-- is written BEFORE the source job is deleted.
create table dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  source_job_id text not null,
  job_data jsonb not null,
  failure_output jsonb,
  dead_lettered_at timestamptz not null default now()
);

create index dead_letter_events_queue_idx on dead_letter_events (queue_name, dead_lettered_at desc);

-- Down Migration
drop table dead_letter_events;
