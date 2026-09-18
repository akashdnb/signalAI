import type { Pool } from "pg";

export interface Milestone {
  id: string;
  tenantId: string;
  campaignId: string;
  ordinal: number;
  goalDescription: string;
  captureField: string | null;
}

interface MilestoneRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  ordinal: number;
  goal_description: string;
  capture_field: string | null;
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    ordinal: row.ordinal,
    goalDescription: row.goal_description,
    captureField: row.capture_field,
  };
}

/**
 * Replaces the campaign's entire milestone list atomically — this is the
 * creator's whole configuration surface (an ordered plain-language goal
 * list), so "edit the milestones" is naturally "replace the list," not a
 * per-row CRUD dance.
 */
export async function setCampaignMilestones(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  milestones: Array<{ goalDescription: string; captureField?: string }>,
): Promise<Milestone[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from campaign_milestones where campaign_id = $1 and tenant_id = $2`, [
      campaignId,
      tenantId,
    ]);

    const inserted: MilestoneRow[] = [];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]!;
      const result = await client.query<MilestoneRow>(
        `insert into campaign_milestones (tenant_id, campaign_id, ordinal, goal_description, capture_field)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, campaignId, i, m.goalDescription, m.captureField ?? null],
      );
      inserted.push(result.rows[0]!);
    }

    await client.query("COMMIT");
    return inserted.map(toMilestone);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMilestones(pool: Pool, tenantId: string, campaignId: string): Promise<Milestone[]> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones where campaign_id = $1 and tenant_id = $2 order by ordinal`,
    [campaignId, tenantId],
  );
  return result.rows.map(toMilestone);
}

export async function getMilestone(pool: Pool, tenantId: string, milestoneId: string): Promise<Milestone | null> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones where id = $1 and tenant_id = $2`,
    [milestoneId, tenantId],
  );
  return result.rows[0] ? toMilestone(result.rows[0]) : null;
}

export async function getNextMilestone(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  afterOrdinal: number,
): Promise<Milestone | null> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones where campaign_id = $1 and tenant_id = $2 and ordinal > $3
     order by ordinal limit 1`,
    [campaignId, tenantId, afterOrdinal],
  );
  return result.rows[0] ? toMilestone(result.rows[0]) : null;
}

export async function getFirstMilestone(pool: Pool, tenantId: string, campaignId: string): Promise<Milestone | null> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones where campaign_id = $1 and tenant_id = $2 order by ordinal limit 1`,
    [campaignId, tenantId],
  );
  return result.rows[0] ? toMilestone(result.rows[0]) : null;
}

/** Per-milestone drop-off (roadmap Milestone Analytics) — an append-only fact, never updated or deleted. */
export async function recordMilestoneAdvancement(
  pool: Pool,
  tenantId: string,
  leadId: string,
  campaignId: string,
  milestoneId: string,
): Promise<void> {
  await pool.query(
    `insert into milestone_advancements (tenant_id, lead_id, campaign_id, milestone_id) values ($1, $2, $3, $4)`,
    [tenantId, leadId, campaignId, milestoneId],
  );
}
