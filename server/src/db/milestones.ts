import type { Pool, PoolClient } from "pg";
import { classifyInput } from "../lib/guardrails.js";

const MAX_GOAL_DESCRIPTION_LENGTH = 200;
const MAX_CAPTURE_FIELD_LENGTH = 50;
// A milestone that captures too many fields at once stops being "a short
// conversational ask" and starts being a form — defeats the whole point of
// multi-field capture, which is to shorten the conversation, not just move
// the same amount of asking into one denser message.
const MAX_CAPTURE_FIELDS_PER_MILESTONE = 4;

/**
 * R3-03 fix, write-time half: goalDescription/captureFields are tenant-
 * authored and land in the LLM's instruction channel (see
 * milestoneEngine.ts's buildSystemPrompt). Rejecting obviously
 * instruction-shaped text here — reusing classifyInput, since the risk is
 * identical to what it already detects in end-user messages — is cheaper
 * now than after campaigns with bad goal text exist.
 */
function validateMilestoneInput(goalDescription: string, captureFields?: string[]): void {
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

  if (captureFields !== undefined) {
    if (captureFields.length > MAX_CAPTURE_FIELDS_PER_MILESTONE) {
      throw new Error(`a milestone may capture at most ${MAX_CAPTURE_FIELDS_PER_MILESTONE} fields`);
    }
    for (const field of captureFields) {
      if (!/^[a-zA-Z0-9_]{1,50}$/.test(field) || field.length > MAX_CAPTURE_FIELD_LENGTH) {
        throw new Error("each captureField must be a short identifier (letters, digits, underscore only)");
      }
    }
  }
}

export interface Milestone {
  id: string;
  tenantId: string;
  campaignId: string;
  ordinal: number;
  goalDescription: string;
  captureFields: string[];
}

interface MilestoneRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  ordinal: number;
  goal_description: string;
  capture_fields: string[];
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    ordinal: row.ordinal,
    goalDescription: row.goal_description,
    captureFields: row.capture_fields,
  };
}

/**
 * Replaces the campaign's entire milestone list atomically — this is the
 * creator's whole configuration surface (an ordered plain-language goal
 * list), so "edit the milestones" is naturally "replace the list," not a
 * per-row CRUD dance.
 */
export async function setCampaignMilestonesWithClient(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  milestones: Array<{ goalDescription: string; captureFields?: string[] }>,
): Promise<Milestone[]> {
  // Soft-delete, not delete: milestone_advancements is an append-only
  // analytics log with a not-null FK to these rows, so a hard delete
  // fails as soon as any lead has advanced past a milestone.
  await client.query(
    `update campaign_milestones set deleted_at = now()
     where campaign_id = $1 and tenant_id = $2 and deleted_at is null`,
    [campaignId, tenantId],
  );

  const inserted: MilestoneRow[] = [];
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]!;
    validateMilestoneInput(m.goalDescription, m.captureFields);
    const result = await client.query<MilestoneRow>(
      `insert into campaign_milestones (tenant_id, campaign_id, ordinal, goal_description, capture_fields)
       values ($1, $2, $3, $4, $5) returning *`,
      [tenantId, campaignId, i, m.goalDescription, m.captureFields ?? []],
    );
    inserted.push(result.rows[0]!);
  }

  return inserted.map(toMilestone);
}

export async function setCampaignMilestones(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  milestones: Array<{ goalDescription: string; captureFields?: string[] }>,
): Promise<Milestone[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await setCampaignMilestonesWithClient(
      client,
      tenantId,
      campaignId,
      milestones,
    );
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMilestones(pool: Pool, tenantId: string, campaignId: string): Promise<Milestone[]> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones
     where campaign_id = $1 and tenant_id = $2 and deleted_at is null order by ordinal`,
    [campaignId, tenantId],
  );
  return result.rows.map(toMilestone);
}

export async function listMilestonesWithClient(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
): Promise<Milestone[]> {
  const result = await client.query<MilestoneRow>(
    `select * from campaign_milestones
     where campaign_id = $1 and tenant_id = $2 and deleted_at is null order by ordinal`,
    [campaignId, tenantId],
  );
  return result.rows.map(toMilestone);
}

export async function getMilestone(pool: Pool, tenantId: string, milestoneId: string): Promise<Milestone | null> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones where id = $1 and tenant_id = $2 and deleted_at is null`,
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
    `select * from campaign_milestones
     where campaign_id = $1 and tenant_id = $2 and deleted_at is null and ordinal > $3
     order by ordinal limit 1`,
    [campaignId, tenantId, afterOrdinal],
  );
  return result.rows[0] ? toMilestone(result.rows[0]) : null;
}

export async function getFirstMilestone(pool: Pool, tenantId: string, campaignId: string): Promise<Milestone | null> {
  const result = await pool.query<MilestoneRow>(
    `select * from campaign_milestones
     where campaign_id = $1 and tenant_id = $2 and deleted_at is null order by ordinal limit 1`,
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
