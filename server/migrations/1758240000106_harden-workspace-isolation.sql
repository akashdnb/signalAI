-- Up Migration
-- Enforce one active invitation per normalized tenant/email.
-- Expired invitations are revoked by the invitation creation transaction before
-- a new invitation is inserted, so the partial unique index remains durable.
create unique index tenant_invitations_active_email_unique
  on tenant_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Down Migration

drop index tenant_invitations_active_email_unique;
