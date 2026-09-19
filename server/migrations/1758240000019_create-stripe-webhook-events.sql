-- Up Migration
-- R10-03 fix: Stripe redelivers on any non-2xx response and can deliver
-- the same event more than once regardless of that — without a record of
-- what has already been processed, a redelivered or out-of-order event is
-- indistinguishable from a fresh one (the mechanism that makes R10-02's
-- stale-cancellation bug reachable). Same idempotency shape as
-- lead_events' unique index on meta_event_id.
create table stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

-- Down Migration
drop table stripe_webhook_events;
