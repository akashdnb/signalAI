-- Up Migration
-- A reusable journey definition can run against many accounts, but every
-- execution must be pinned to exactly one account so concurrent conversations
-- on two accounts cannot share runtime state or credentials.

alter table journey_executions
  add column instagram_account_id text;

alter table journey_executions
  add constraint journey_executions_instagram_account_fk
  foreign key (instagram_account_id)
  references meta_tokens(instagram_account_id)
  on delete set null;

-- Preserve historical executions when the tenant had exactly one account.
update journey_executions je
set instagram_account_id = mt.instagram_account_id
from meta_tokens mt
where je.instagram_account_id is null
  and mt.tenant_id = je.tenant_id
  and (
    select count(*)
    from meta_tokens mt2
    where mt2.tenant_id = je.tenant_id
  ) = 1;

drop index journey_executions_active_subject_unique;

-- PostgreSQL UNIQUE indexes treat NULL values as distinct. Use a normalized
-- expression so legacy account-less executions retain the original one-active-
-- execution invariant, while account-specific executions remain isolated.
create unique index journey_executions_active_subject_unique
  on journey_executions (
    tenant_id,
    campaign_id,
    coalesce(instagram_account_id, ''),
    subject_key
  )
  where status in ('running', 'waiting', 'handoff');

create index journey_executions_account_idx
  on journey_executions (
    tenant_id,
    instagram_account_id,
    updated_at desc
  );

-- Down Migration

drop index journey_executions_account_idx;
drop index journey_executions_active_subject_unique;

alter table journey_executions
  drop constraint journey_executions_instagram_account_fk;

alter table journey_executions
  drop column instagram_account_id;

create unique index journey_executions_active_subject_unique
  on journey_executions (
    tenant_id,
    campaign_id,
    subject_key
  )
  where status in ('running', 'waiting', 'handoff');
