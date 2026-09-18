-- Up Migration
-- Account Health Monitoring (roadmap Phase 1 Account & Authentication):
-- surfaces token validity/refresh status without a human having to
-- discover a silent expiry. status starts 'healthy' on connect; the
-- refresh job flips it to 'error' on a failed refresh and records why.
alter table meta_tokens add column status text not null default 'healthy';
alter table meta_tokens add column last_error text;
alter table meta_tokens add column last_checked_at timestamptz not null default now();

alter table meta_tokens add constraint meta_tokens_status_check
  check (status in ('healthy', 'error'));

-- Down Migration
alter table meta_tokens drop constraint meta_tokens_status_check;
alter table meta_tokens drop column status;
alter table meta_tokens drop column last_error;
alter table meta_tokens drop column last_checked_at;
