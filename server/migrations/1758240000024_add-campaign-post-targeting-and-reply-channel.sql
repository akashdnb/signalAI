-- Up Migration
-- Two independent additions to a campaign's config surface, both raised in
-- review: (1) keyword matching ran against every enabled campaign
-- tenant-wide with no notion of which post a comment was on, so two
-- campaigns targeting different posts with overlapping keywords couldn't
-- coexist; (2) a reply was always sent as a DM regardless of the "comment"
-- vs "dm" tier already threaded through the reply engine — that tier only
-- ever changed prompt/length constraints, never where the reply was
-- delivered.

-- Empty array = unrestricted (matches every post), preserving today's
-- behaviour for every existing campaign without a backfill.
alter table campaigns add column target_media_ids text[] not null default array[]::text[];

alter table campaigns add column reply_channel text not null default 'dm';
alter table campaigns add constraint campaigns_reply_channel_check
  check (reply_channel in ('dm', 'comment', 'both'));

-- media_id/comment_id are structural facts (which post, which comment),
-- not PII — same column lead_events.attributes already carries
-- matchedCampaignId/matchedKeyword. Recorded for every comment event, not
-- only matched ones, so the BUI can offer "posts we've seen a comment on"
-- as the picker for target_media_ids above without a separate Graph API
-- media-listing call (deferred to roadmap Phase 2A's Top Performing Posts).
comment on column lead_events.attributes is
  'Non-PII structural facts only (e.g. matchedCampaignId, matchedKeyword, mediaId, commentId). Comment/DM text, username, phone never go here — see lead_pii.';

-- Down Migration
alter table campaigns drop constraint campaigns_reply_channel_check;
alter table campaigns drop column reply_channel;
alter table campaigns drop column target_media_ids;
