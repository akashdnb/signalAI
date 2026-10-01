-- Up Migration

alter table instagram_inbound_events
  drop constraint if exists instagram_inbound_events_instagram_account_id_fkey;

alter table instagram_inbound_events
  add constraint instagram_inbound_events_instagram_account_id_fkey
  foreign key (instagram_account_id)
  references meta_tokens(id)
  on delete cascade;

-- Down Migration

alter table instagram_inbound_events
  drop constraint if exists instagram_inbound_events_instagram_account_id_fkey;

alter table instagram_inbound_events
  add constraint instagram_inbound_events_instagram_account_id_fkey
  foreign key (instagram_account_id)
  references instagram_accounts(id)
  on delete cascade;
