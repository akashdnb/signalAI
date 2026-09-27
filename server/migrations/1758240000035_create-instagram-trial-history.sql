-- Up Migration
-- Phase 2B Trial-Abuse Guardrail: "tie trial eligibility to the connected
-- Instagram account / verified identity, not just an email/signup, so one
-- client can't cycle endless free trials." One row per Instagram account
-- that has EVER been connected to any tenant — the first tenant to connect
-- it is the one that gets the trial; every later connection (a different
-- tenant, or the same tenant reconnecting) is checked against this and
-- never re-grants one. Deliberately never deleted, including on Data
-- Deletion Callback scrubs — it holds no PII (an Instagram account id
-- links here to itself, not to a person's name/username/email) and its
-- entire purpose is to survive a tenant's own data being scrubbed.
create table instagram_trial_history (
  instagram_account_id text primary key,
  first_tenant_id uuid not null references tenants(id),
  first_connected_at timestamptz not null default now()
);

-- Down Migration
drop table instagram_trial_history;
