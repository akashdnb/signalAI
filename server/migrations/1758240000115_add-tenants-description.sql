-- Up Migration
-- Agency Workspaces (docs/AGENCY_WORKSPACES_AND_BULK_BILLING_PLAN.md): a
-- short free-text description shown on the workspace switcher and the
-- workspace General settings. Nullable — every existing tenant (created via
-- createTenantForUser, which never took a description) keeps rendering fine
-- without one. Like `name`, this is a user-visible display field that lands
-- in listings and logs, so the application layer validates it against PII
-- (R14-05) and length-caps it before every write — there is no PII-scrubbing
-- here the way there is for lead_pii.
alter table tenants add column description text;

-- Down Migration
alter table tenants drop column description;
