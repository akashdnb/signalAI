-- Up Migration
-- R1-08/R1-09 review fix: deletion confirmation status used to live in an
-- in-process Map (lost on restart — the App Reviewer checking the status
-- URL is exactly who hits that) and the scrub ran synchronously inside the
-- callback request, risking a timeout on many matched leads. Persisted
-- here; the scrub itself runs in a worker (see queue/dataDeletionQueue.ts).
create table data_deletion_requests (
  confirmation_code uuid primary key default gen_random_uuid(),
  meta_user_id text not null,
  status text not null default 'pending' check (status in ('pending', 'complete')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Down Migration
drop table data_deletion_requests;
