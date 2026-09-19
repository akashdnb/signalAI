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
