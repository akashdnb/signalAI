-- Up Migration
-- B9 rate limiter: Meta's binding ceiling is 750 private replies/hour per
-- connected Instagram account (confirmed Sep 2026) — an hourly budget, so
-- a viral Reel exhausts it in minutes and the send queue must drain over
-- hours rather than drop. One row per actual send; the count of rows in
-- the trailing hour per account is the live rate-limit state.
create table account_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  instagram_account_id text not null,
  sent_at timestamptz not null default now()
);

create index account_sends_account_window_idx on account_sends (instagram_account_id, sent_at);

-- Down Migration
drop table account_sends;
