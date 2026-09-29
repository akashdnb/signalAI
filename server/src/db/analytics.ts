import type { Pool } from "pg";

export interface TenantAnalytics {
  commentsReceived: number;
  dmsSent: number;
  dmFailures: number;
  uniqueLeads: number;
}

/**
 * B11: "Analytics: comments received, DMs sent, DM failures, unique
 * leads. Four numbers, sourced from the event log." Each is pulled from
 * the durable table that actually owns that fact, rather than a
 * purpose-built rollup — there's no separate analytics ledger to keep in
 * sync in Phase 1:
 *  - comments received / unique leads: lead_events / leads (the durable
 *    inbound event log this phase's whole pipeline is built around).
 *  - DMs sent: account_sends — deliberately un-pruned since B10/B11 (see
 *    accountSends.ts's pruneOldSends docstring) specifically so this
 *    number stays accurate for the tenant's whole history, not just the
 *    trailing rate-limit window it also serves.
 *  - DM failures: dead_letter_events, filtered to this tenant via the
 *    job payload — a permanently-failed send is the durable record of a
 *    failure; a transient one that succeeded on retry was never really a
 *    failure from the creator's point of view.
 */
export async function getTenantAnalytics(pool: Pool, tenantId: string): Promise<TenantAnalytics> {
  const [comments, uniqueLeads, dmsSent, dmFailures] = await Promise.all([
    pool.query<{ count: string }>(
      `select count(*)::int as count from lead_events where tenant_id = $1 and event_type = 'comment'`,
      [tenantId],
    ),
    pool.query<{ count: string }>(`select count(*)::int as count from leads where tenant_id = $1`, [tenantId]),
    pool.query<{ count: string }>(`select count(*)::int as count from account_sends where tenant_id = $1`, [
      tenantId,
    ]),
    pool.query<{ count: string }>(
      `select count(*)::int as count from dead_letter_events
       where queue_name = 'lead-events' and job_data->>'tenantId' = $1`,
      [tenantId],
    ),
  ]);

  return {
    commentsReceived: Number(comments.rows[0]!.count),
    uniqueLeads: Number(uniqueLeads.rows[0]!.count),
    dmsSent: Number(dmsSent.rows[0]!.count),
    dmFailures: Number(dmFailures.rows[0]!.count),
  };
}

export interface TopPost {
  mediaId: string;
  caption: string | null;
  permalink: string | null;
  commentCount: number;
}

/**
 * Phase 2A "Top Performing Posts" (carried from Phase 1's deferred list).
 * Counts comment events by mediaId — mediaId is only ever captured on a
 * comment event (webhookIngestService.ts), never a DM, so this is
 * naturally comment-only without an extra filter. Left-joined against
 * media_metadata for caption/permalink (Phase 1's post-targeting picker
 * enrichment) — a post the cache hasn't enriched yet still shows up,
 * just without those two fields, same graceful-degradation the picker
 * itself already accepts.
 */
export async function getTopPosts(pool: Pool, tenantId: string, limit = 10): Promise<TopPost[]> {
  const result = await pool.query<{
    media_id: string;
    caption: string | null;
    permalink: string | null;
    comment_count: string;
  }>(
    `select e.attributes->>'mediaId' as media_id, m.caption, m.permalink, count(*)::int as comment_count
     from lead_events e
     left join media_metadata m on m.tenant_id = e.tenant_id and m.media_id = e.attributes->>'mediaId'
     where e.tenant_id = $1 and e.event_type = 'comment' and e.attributes->>'mediaId' is not null
     group by e.attributes->>'mediaId', m.caption, m.permalink
     order by comment_count desc
     limit $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => ({
    mediaId: row.media_id,
    caption: row.caption,
    permalink: row.permalink,
    commentCount: Number(row.comment_count),
  }));
}

export interface TopKeyword {
  keyword: string;
  matchCount: number;
}

/** Phase 2A "Top Trigger Keywords" (carried from Phase 1's deferred list) — counts matched (not just received) events by the keyword that actually triggered a campaign. */
export async function getTopKeywords(pool: Pool, tenantId: string, limit = 10): Promise<TopKeyword[]> {
  const result = await pool.query<{ keyword: string; match_count: string }>(
    `select attributes->>'matchedKeyword' as keyword, count(*)::int as match_count
     from lead_events
     where tenant_id = $1 and attributes->>'matchedKeyword' is not null
     group by attributes->>'matchedKeyword'
     order by match_count desc
     limit $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => ({ keyword: row.keyword, matchCount: Number(row.match_count) }));
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface Funnel {
  stages: FunnelStage[];
  /** Leads still open — neither won nor lost — the roadmap's "leads without outcomes" gap made real, scoped to what's actually computable (no attribution/identity-matching concept exists yet for the rest of that gap). */
  openWithNoOutcome: number;
}

/**
 * R4 Analytics: built from each lead's CURRENT pipeline_stage (a live
 * snapshot, not a transition history — nothing else in this app tracks
 * leads any differently, see Dashboard/Leads pages) so "Qualified" etc.
 * below are cumulative "reached this stage or later" counts, and a lead
 * marked 'lost' after reaching Qualified no longer counts there — same
 * simplification the rest of the app already lives with. 'Reach' isn't
 * included: no impression/reach data exists anywhere to back it.
 */
export async function getPipelineFunnel(pool: Pool, tenantId: string): Promise<Funnel> {
  const [comments, dmsSent, uniqueLeads, stageRows] = await Promise.all([
    pool.query<{ count: string }>(
      `select count(*)::int as count from lead_events where tenant_id = $1 and event_type = 'comment'`,
      [tenantId],
    ),
    pool.query<{ count: string }>(`select count(*)::int as count from account_sends where tenant_id = $1`, [tenantId]),
    pool.query<{ count: string }>(`select count(*)::int as count from leads where tenant_id = $1`, [tenantId]),
    pool.query<{ pipeline_stage: string; count: string }>(
      `select pipeline_stage, count(*)::int as count from leads where tenant_id = $1 group by pipeline_stage`,
      [tenantId],
    ),
  ]);

  const byStage = new Map(stageRows.rows.map((r) => [r.pipeline_stage, Number(r.count)]));
  const countAtLeast = (stages: string[]) => stages.reduce((sum, s) => sum + (byStage.get(s) ?? 0), 0);

  return {
    stages: [
      { key: "comments", label: "Comments", count: Number(comments.rows[0]!.count) },
      { key: "dms", label: "DMs", count: Number(dmsSent.rows[0]!.count) },
      { key: "leads", label: "Leads", count: Number(uniqueLeads.rows[0]!.count) },
      { key: "qualified", label: "Qualified", count: countAtLeast(["qualified", "meeting_scheduled", "won"]) },
      { key: "meeting", label: "Meeting Scheduled", count: countAtLeast(["meeting_scheduled", "won"]) },
      { key: "won", label: "Won", count: countAtLeast(["won"]) },
    ],
    openWithNoOutcome: countAtLeast(["new", "contacted", "qualified", "meeting_scheduled"]),
  };
}

export interface RevenueByCurrency {
  currency: string;
  total: number;
}

/** Grouped by currency rather than a flat sum — deals.currency is per-deal, not tenant-fixed, so a flat SUM would silently mix currencies. */
export async function getRevenueSummary(pool: Pool, tenantId: string): Promise<RevenueByCurrency[]> {
  const result = await pool.query<{ currency: string; total: string }>(
    `select currency, sum(value)::numeric as total
     from deals
     where tenant_id = $1 and stage = 'won' and value is not null
     group by currency
     order by total desc`,
    [tenantId],
  );
  return result.rows.map((row) => ({ currency: row.currency, total: Number(row.total) }));
}

export interface ConversationsTimeseriesPoint {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  comments: number;
  dms: number;
}

/**
 * Dashboard "Conversations over time" chart: daily comment/DM counts for
 * the trailing 30 days (inclusive of today), zero-filled for days with no
 * activity via generate_series rather than only returning days that have
 * rows.
 */
export async function getConversationsTimeseries(pool: Pool, tenantId: string): Promise<ConversationsTimeseriesPoint[]> {
  const result = await pool.query<{ date: string; comments: string; dms: string }>(
    `select
       to_char(d::date, 'YYYY-MM-DD') as date,
       coalesce(c.count, 0) as comments,
       coalesce(m.count, 0) as dms
     from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d
     left join (
       select date_trunc('day', occurred_at) as day, count(*)::int as count
       from lead_events
       where tenant_id = $1 and event_type = 'comment' and occurred_at >= current_date - interval '29 days'
       group by 1
     ) c on c.day = d
     left join (
       select date_trunc('day', sent_at) as day, count(*)::int as count
       from account_sends
       where tenant_id = $1 and sent_at >= current_date - interval '29 days'
       group by 1
     ) m on m.day = d
     order by d`,
    [tenantId],
  );
  return result.rows.map((row) => ({ date: row.date, comments: Number(row.comments), dms: Number(row.dms) }));
}

export interface MilestoneDropoff {
  milestoneId: string;
  ordinal: number;
  goalDescription: string;
  advancedCount: number;
}

/** B11/BUI: "milestone drop-off from B8" — how many leads have ever advanced past each milestone in this campaign, in order, so a creator can see exactly where the funnel leaks. */
export async function getMilestoneDropoff(pool: Pool, tenantId: string, campaignId: string): Promise<MilestoneDropoff[]> {
  const result = await pool.query<{
    milestone_id: string;
    ordinal: number;
    goal_description: string;
    advanced_count: string;
  }>(
    `select m.id as milestone_id, m.ordinal, m.goal_description,
            count(a.id)::int as advanced_count
     from campaign_milestones m
     left join milestone_advancements a on a.milestone_id = m.id and a.tenant_id = $1
     where m.campaign_id = $2 and m.tenant_id = $1
     group by m.id, m.ordinal, m.goal_description
     order by m.ordinal`,
    [tenantId, campaignId],
  );
  return result.rows.map((row) => ({
    milestoneId: row.milestone_id,
    ordinal: row.ordinal,
    goalDescription: row.goal_description,
    advancedCount: Number(row.advanced_count),
  }));
}
