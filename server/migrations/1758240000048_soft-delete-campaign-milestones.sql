-- Up Migration
-- setCampaignMilestones (the milestone editor's "replace the whole list"
-- save) hard-deleted every existing row and reinserted fresh ones. That
-- collides with milestone_advancements' FK to campaign_milestones(id):
-- once any lead has advanced past a milestone (an append-only analytics
-- fact, never deleted), the hard delete violates the FK and the save
-- fails outright — not an edge case, the normal case for any campaign
-- with real traffic. Same soft-delete pattern as lead_pii/
-- lead_captured_facts: mark old rows deleted instead of removing them,
-- so milestone_advancements' history stays intact and edits stop
-- colliding with it.
alter table campaign_milestones add column deleted_at timestamptz;

alter table campaign_milestones drop constraint campaign_milestones_campaign_id_ordinal_key;
create unique index campaign_milestones_campaign_id_ordinal_key
  on campaign_milestones (campaign_id, ordinal) where deleted_at is null;

drop index campaign_milestones_campaign_idx;
create index campaign_milestones_campaign_idx
  on campaign_milestones (campaign_id, ordinal) where deleted_at is null;

-- Down Migration
drop index campaign_milestones_campaign_idx;
create index campaign_milestones_campaign_idx on campaign_milestones (campaign_id, ordinal);

drop index campaign_milestones_campaign_id_ordinal_key;
alter table campaign_milestones add constraint campaign_milestones_campaign_id_ordinal_key unique (campaign_id, ordinal);

alter table campaign_milestones drop column deleted_at;
