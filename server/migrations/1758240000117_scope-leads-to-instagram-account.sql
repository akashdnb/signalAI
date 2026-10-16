-- Up Migration
-- Separate the same Instagram visitor across different connected business accounts.
-- Legacy leads can only be backfilled when there is exactly one account in the
-- workspace; multi-account history is intentionally left unattributed rather
-- than guessed and merged into the wrong conversation.

alter table leads
  add column instagram_account_id text;

-- Keep the provider account ID after disconnect. It is durable conversation identity,
-- not a foreign key to the currently connected credential row.

update leads l
   set instagram_account_id = only_account.instagram_account_id
  from (
    select tenant_id, min(instagram_account_id) as instagram_account_id
      from meta_tokens
     group by tenant_id
    having count(*) = 1
  ) only_account
 where l.tenant_id = only_account.tenant_id
   and l.instagram_account_id is null;

drop index leads_tenant_instagram_user_idx;

create unique index leads_tenant_instagram_account_user_idx
  on leads (tenant_id, instagram_account_id, instagram_user_id)
  where instagram_account_id is not null and instagram_user_id is not null;

create unique index leads_tenant_instagram_user_legacy_idx
  on leads (tenant_id, instagram_user_id)
  where instagram_account_id is null and instagram_user_id is not null;

create index leads_tenant_account_idx
  on leads (tenant_id, instagram_account_id);

-- Down Migration
drop index if exists leads_tenant_account_idx;
drop index if exists leads_tenant_instagram_user_legacy_idx;
drop index if exists leads_tenant_instagram_account_user_idx;

alter table leads
  drop constraint if exists leads_instagram_account_fk;

alter table leads
  drop column instagram_account_id;

create unique index leads_tenant_instagram_user_idx
  on leads (tenant_id, instagram_user_id)
  where instagram_user_id is not null;
