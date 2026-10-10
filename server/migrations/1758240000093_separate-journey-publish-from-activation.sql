-- Up Migration
-- Publishing a journey must create the immutable runtime snapshot without
-- changing the campaign's current enabled state. The publish route writes
-- the snapshot and then performs its existing campaign update in the same
-- transaction, so a transaction-local marker lets the database distinguish
-- that internal publication update from an explicit activation request.

create or replace function signalai_mark_journey_published()
returns trigger
language plpgsql
as $$
begin
  perform set_config('signalai.journey_publish_in_progress', 'true', true);
  return new;
end;
$$;

create or replace function signalai_preserve_enabled_during_publish()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('signalai.journey_publish_in_progress', true), 'false') = 'true' then
    new.enabled := old.enabled;
  end if;
  return new;
end;
$$;

create trigger campaign_journey_versions_mark_publish
  after insert on campaign_journey_versions
  for each row
  execute function signalai_mark_journey_published();

create trigger campaigns_preserve_enabled_during_publish
  before update of enabled on campaigns
  for each row
  execute function signalai_preserve_enabled_during_publish();

-- Down Migration

drop trigger if exists campaigns_preserve_enabled_during_publish on campaigns;
drop trigger if exists campaign_journey_versions_mark_publish on campaign_journey_versions;
drop function if exists signalai_preserve_enabled_during_publish();
drop function if exists signalai_mark_journey_published();
