-- Up Migration
-- R11-02 fix: a leaked session token was only revocable by rotating
-- SESSION_SECRET, which signs out every tenant at once. Including this in
-- the token payload and comparing it against the tenant's current value
-- (see lib/tenantAuth.ts) makes revocation a single per-tenant update
-- instead of an indiscriminate one.
alter table tenants add column session_version integer not null default 1;

-- Down Migration
alter table tenants drop column session_version;
