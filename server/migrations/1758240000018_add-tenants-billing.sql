-- Up Migration
-- B11: Single Flat Plan via Stripe Checkout (roadmap Phase 1 Billing) —
-- one price, one button, one tier. No quotas, no metered ledger, no trial
-- state machine — those are explicitly Phase 2B. This is the minimum
-- state needed to know "is this tenant's subscription active" and to
-- resolve a Stripe webhook event back to a tenant.
alter table tenants add column stripe_customer_id text;
alter table tenants add column stripe_subscription_id text;
alter table tenants add column billing_status text not null default 'none';

alter table tenants add constraint tenants_billing_status_check
  check (billing_status in ('none', 'active', 'canceled'));

create unique index tenants_stripe_customer_id_idx on tenants (stripe_customer_id) where stripe_customer_id is not null;

-- Down Migration
drop index tenants_stripe_customer_id_idx;
alter table tenants drop constraint tenants_billing_status_check;
alter table tenants drop column billing_status;
alter table tenants drop column stripe_subscription_id;
alter table tenants drop column stripe_customer_id;
