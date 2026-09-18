-- Up Migration
-- R5-01 fix: reconnecting the same Instagram account used to silently mint
-- a second tenant (see src/routes/auth.ts), and meta_tokens' uniqueness
-- was only per (tenant_id, instagram_account_id) — it allowed two tenants
-- to each hold a row for the same Instagram account. findTenantByInstagramAccountId
-- has no ORDER BY/LIMIT and just takes the first row, so inbound webhooks
-- for that account route to an arbitrary one of the two tenants. One
-- Instagram account can only ever belong to one tenant, so the correct
-- constraint is global, not composite.
--
-- R6-05 fix: creating that unique index with no dedup step fails outright
-- on any database that already contains the duplicates this migration
-- exists to prevent — exactly the state R5-01 describes any environment
-- that saw a pre-fix reconnect being in. Keep only the row with the
-- greatest (updated_at, id) per account — id as a tiebreaker only for
-- determinism, not for any meaning in its value — before adding the
-- constraint. A no-op delete (matches zero rows) on a fresh database.
delete from meta_tokens t
using meta_tokens newer
where t.instagram_account_id = newer.instagram_account_id
  and (t.updated_at, t.id) < (newer.updated_at, newer.id);

drop index meta_tokens_tenant_account_idx;
create unique index meta_tokens_account_idx on meta_tokens (instagram_account_id);

-- Down Migration
drop index meta_tokens_account_idx;
create unique index meta_tokens_tenant_account_idx on meta_tokens (tenant_id, instagram_account_id);
