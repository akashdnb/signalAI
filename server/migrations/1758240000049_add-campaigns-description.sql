-- Up Migration
-- Automation Details rebuild: a short free-text summary shown on the
-- journey card and the Details "Basic Information" card. Nullable —
-- every existing campaign (created via createCampaign, which never took
-- a description) keeps rendering fine with the client's synthesized
-- fallback summary.
alter table campaigns add column description text;

-- Down Migration
alter table campaigns drop column description;
