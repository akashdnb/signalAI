-- Up Migration
-- Customer/Lead split (roadmap Phase 1 Platform Foundations, pulled forward
-- from an original Phase 2A draft during the CRM/Revenue Intelligence
-- architecture review): today lead_id IS the identity everything keys on.
-- That collapses once a real person can plausibly generate a second lead
-- (a repeat Reel engager, a second campaign touch) — Phase 3's identity
-- resolution needs a stable seam to attach a new lead_id to. Minted 1:1
-- with each lead for now; no behavior change in Phase 1.
create table customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Nullable, not NOT NULL: findOrCreateLeadByInstagramUserId mints the
-- customer row and links it in a follow-up statement on the SAME
-- transaction as the lead insert (see leads.ts), gated on that insert
-- actually firing (xmax = 0) so a flood of repeat-comment events from an
-- existing lead never mints an orphan customer row. A NOT NULL constraint
-- would reject the initial insert before that follow-up statement runs —
-- the enclosing transaction (webhookIngestService.ts's ingestOneEvent)
-- already guarantees no other reader ever observes a committed lead
-- without one.
alter table leads add column customer_id uuid references customers(id);

-- Backfill: mint one customer per lead that predates this migration, 1:1.
-- The customers row must exist before any leads row references it — the
-- FK isn't deferrable, so it's checked at the end of the UPDATE statement
-- below, not at transaction commit. Reusing each lead's own id as its
-- customer's id (rather than a fresh gen_random_uuid() per row) sidesteps
-- needing to correlate a freshly generated id back to the specific lead
-- it belongs to, which INSERT ... RETURNING doesn't guarantee order-wise.
insert into customers (id, created_at)
  select id, created_at from leads where customer_id is null;
update leads set customer_id = id where customer_id is null;

create index leads_customer_id_idx on leads (customer_id);

-- Down Migration
drop index leads_customer_id_idx;
alter table leads drop column customer_id;
drop table customers;
