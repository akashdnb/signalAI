-- Up Migration
-- R5-01 fix: reconnecting the same Instagram account used to silently mint
-- a second tenant (see src/routes/auth.ts), and meta_tokens' uniqueness
-- was only per (tenant_id, instagram_account_id) — it allowed two tenants
-- to each hold a row for the same Instagram account. findTenantByInstagramAccountId
-- has no ORDER BY/LIMIT and just takes the first row, so inbound webhooks
-- for that account route to an arbitrary one of the two tenants. One
-- Instagram account can only ever belong to one tenant, so the correct
-- constraint is global, not composite.
drop index meta_tokens_tenant_account_idx;
create unique index meta_tokens_account_idx on meta_tokens (instagram_account_id);

-- Down Migration
drop index meta_tokens_account_idx;
create unique index meta_tokens_tenant_account_idx on meta_tokens (tenant_id, instagram_account_id);
