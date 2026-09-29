-- Up Migration
-- Multi-field milestone capture: a milestone used to capture exactly one
-- field per conversational turn, forcing "collect email" and "collect
-- mobile number" into two separate back-and-forth turns even though a
-- lead will often answer both at once if just asked together. capture_field
-- becomes capture_fields (ordered array; empty = capture nothing, same
-- semantics as null before). Existing rows are backfilled 1:1 before the
-- old column is dropped, so no data is lost and milestone id/ordinal are
-- untouched — leads mid-funnel (leads.active_milestone_id) are unaffected.
alter table campaign_milestones add column capture_fields text[] not null default '{}';
update campaign_milestones set capture_fields = array[capture_field] where capture_field is not null;
alter table campaign_milestones drop column capture_field;

-- Down Migration
alter table campaign_milestones add column capture_field text;
update campaign_milestones set capture_field = capture_fields[1] where array_length(capture_fields, 1) > 0;
alter table campaign_milestones drop column capture_fields;
