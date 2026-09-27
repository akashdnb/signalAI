-- Up Migration
-- Phase 2B: Free Trial Period + Plan Tiers. plan_tier and billing_status
-- (migration 18) are orthogonal — billing_status tracks whether a Stripe
-- subscription is active, plan_tier tracks WHICH tier a tenant is on
-- (including the free 'trial' tier, which has no subscription at all).
-- Tier definitions themselves (quotas, token allowance, Stripe price ids)
-- live in application code (lib/planTiers.ts), not a DB table — there's no
-- admin surface for defining new tiers at pilot scale, so a hardcoded,
-- version-controlled config is the smaller, more honest surface than a
-- half-built tier-management table nothing edits yet.
alter table tenants add column plan_tier text not null default 'trial';
alter table tenants add constraint tenants_plan_tier_check
  check (plan_tier in ('trial', 'starter', 'growth'));

-- Set once, at tenant creation (createTenantForUser), from config.trialDays
-- — not a SQL default computed from an interval, so the trial length stays
-- a code-level product decision, changeable without a migration. Both
-- nullable: a tenant that has already converted to a paid tier before this
-- column existed (impossible today, since Phase 2B is what introduces
-- paid tiers beyond the Phase 1 flat plan — but the invariant is stated
-- here for whoever reads this migration later) has no meaningful trial
-- window and shouldn't be given one retroactively.
alter table tenants add column trial_started_at timestamptz;
alter table tenants add column trial_ends_at timestamptz;

-- Down Migration
alter table tenants drop column trial_ends_at;
alter table tenants drop column trial_started_at;
alter table tenants drop constraint tenants_plan_tier_check;
alter table tenants drop column plan_tier;
