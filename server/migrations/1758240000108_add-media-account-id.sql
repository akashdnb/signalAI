-- Up Migration
-- A tenant can have multiple connected Instagram accounts. Keep the
-- legacy rows readable with a nullable account id, while all newly fetched
-- metadata is associated with the credential that successfully resolved it.
alter table media_metadata
  add column instagram_account_id text;

drop index if exists media_metadata_tenant_media_idx;

create unique index media_metadata_tenant_account_media_idx
  on media_metadata (tenant_id, instagram_account_id, media_id)
  where instagram_account_id is not null;

create unique index media_metadata_tenant_media_legacy_idx
  on media_metadata (tenant_id, media_id)
  where instagram_account_id is null;

-- Down Migration
drop index if exists media_metadata_tenant_account_media_idx;
drop index if exists media_metadata_tenant_media_legacy_idx;
create unique index media_metadata_tenant_media_idx on media_metadata (tenant_id, media_id);
alter table media_metadata drop column instagram_account_id;
