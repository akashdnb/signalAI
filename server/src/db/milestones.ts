import type { Pool } from "pg";
import { classifyInput } from "../lib/guardrails.js";

const MAX_GOAL_DESCRIPTION_LENGTH = 200;
const MAX_CAPTURE_FIELD_LENGTH = 50;

/**
 * R3-03 fix, write-time half: goalDescription/captureField are tenant-
 * authored and land in the LLM's instruction channel (see
 * milestoneEngine.ts's buildSystemPrompt). Rejecting obviously
 * instruction-shaped text here — reusing classifyInput, since the risk is
 * identical to what it already detects in end-user messages — is cheaper
 * now than after campaigns with bad goal text exist.
 */
function validateMilestoneInput(goalDescription: string, captureField?: string): void {
  if (!goalDescription.trim()) {
    throw new Error("goalDescription must not be empty");
  }
  if (goalDescription.length > MAX_GOAL_DESCRIPTION_LENGTH) {
    throw new Error(`goalDescription must be at most ${MAX_GOAL_DESCRIPTION_LENGTH} characters`);
  }
  if (/[\r\n]/.test(goalDescription)) {
    throw new Error("goalDescription must not contain newlines");
  }
  if (classifyInput(goalDescription).blocked) {
    throw new Error("goalDescription looks like an attempt to inject instructions, not a goal description");
  }

  if (captureField !== undefined) {
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(captureField) || captureField.length > MAX_CAPTURE_FIELD_LENGTH) {
      throw new Error("captureField must be a short identifier (letters, digits, underscore only)");
    }
  }
}

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
      validateMilestoneInput(m.goalDescription, m.captureField);
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
