import type { Pool } from "pg";

export type LeadScoreBand = "cold" | "warm" | "hot" | "very_hot";

export interface LeadIntelligence {
  leadId: string;
  tenantId: string;
  intent: string | null;
  need: string | null;
  budgetValue: number | null;
  budgetText: string | null;
  location: string | null;
  score: number;
  scoreBand: LeadScoreBand;
  scoreReasons: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadIntelligenceHistoryEntry {
  id: string;
  leadId: string;
  tenantId: string;
  intent: string | null;
  need: string | null;
  budgetValue: number | null;
  budgetText: string | null;
  location: string | null;
  score: number;
  scoreBand: LeadScoreBand;
  scoreReasons: string[];
  createdAt: Date;
}

interface LeadIntelligenceRow {
  lead_id: string;
  tenant_id: string;
  intent: string | null;
  need: string | null;
  budget_value: string | null;
  budget_text: string | null;
  location: string | null;
  score: number;
  score_band: LeadScoreBand;
  score_reasons: string[];
  created_at: Date;
  updated_at: Date;
}

function toLeadIntelligence(row: LeadIntelligenceRow): LeadIntelligence {
  return {
    leadId: row.lead_id,
    tenantId: row.tenant_id,
    intent: row.intent,
    need: row.need,
    budgetValue: row.budget_value === null ? null : Number(row.budget_value),
    budgetText: row.budget_text,
    location: row.location,
    score: Number(row.score),
    scoreBand: row.score_band,
    scoreReasons: row.score_reasons ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLeadIntelligence(
  pool: Pool,
  tenantId: string,
  leadId: string,
): Promise<LeadIntelligence | null> {
  const result = await pool.query<LeadIntelligenceRow>(
    `select *
       from lead_intelligence
      where tenant_id = $1
        and lead_id = $2`,
    [tenantId, leadId],
  );

  return result.rows[0] ? toLeadIntelligence(result.rows[0]) : null;
}

export async function upsertLeadIntelligence(
  pool: Pool,
  params: {
    tenantId: string;
    leadId: string;
    intent?: string | null;
    need?: string | null;
    budgetValue?: number | null;
    budgetText?: string | null;
    location?: string | null;
    score: number;
    scoreBand: LeadScoreBand;
    scoreReasons: string[];
  },
): Promise<LeadIntelligence> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const previous = await client.query<LeadIntelligenceRow>(
      `select *
         from lead_intelligence
        where tenant_id = $1
          and lead_id = $2
        for update`,
      [params.tenantId, params.leadId],
    );

    const previousRow = previous.rows[0];

    const result = await client.query<LeadIntelligenceRow>(
      `insert into lead_intelligence (
         lead_id,
         tenant_id,
         intent,
         need,
         budget_value,
         budget_text,
         location,
         score,
         score_band,
         score_reasons
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       on conflict (lead_id)
       do update set
         intent = excluded.intent,
         need = excluded.need,
         budget_value = excluded.budget_value,
         budget_text = excluded.budget_text,
         location = excluded.location,
         score = excluded.score,
         score_band = excluded.score_band,
         score_reasons = excluded.score_reasons,
         updated_at = now()
       returning *`,
      [
        params.leadId,
        params.tenantId,
        params.intent ?? null,
        params.need ?? null,
        params.budgetValue ?? null,
        params.budgetText ?? null,
        params.location ?? null,
        params.score,
        params.scoreBand,
        JSON.stringify(params.scoreReasons),
      ],
    );

    const changed =
      !previousRow ||
      previousRow.intent !== (params.intent ?? null) ||
      previousRow.need !== (params.need ?? null) ||
      previousRow.budget_value !==
        (params.budgetValue == null ? null : String(params.budgetValue)) ||
      previousRow.budget_text !== (params.budgetText ?? null) ||
      previousRow.location !== (params.location ?? null) ||
      Number(previousRow.score) !== params.score ||
      previousRow.score_band !== params.scoreBand ||
      JSON.stringify(previousRow.score_reasons ?? []) !== JSON.stringify(params.scoreReasons);

    if (changed) {
      await client.query(
        `insert into lead_intelligence_history (
           tenant_id,
           lead_id,
           intent,
           need,
           budget_value,
           budget_text,
           location,
           score,
           score_band,
           score_reasons
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          params.tenantId,
          params.leadId,
          params.intent ?? null,
          params.need ?? null,
          params.budgetValue ?? null,
          params.budgetText ?? null,
          params.location ?? null,
          params.score,
          params.scoreBand,
          JSON.stringify(params.scoreReasons),
        ],
      );
    }

    await client.query("COMMIT");
    return toLeadIntelligence(result.rows[0]!);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listLeadIntelligenceHistory(
  pool: Pool,
  tenantId: string,
  leadId: string,
  limit = 50,
): Promise<LeadIntelligenceHistoryEntry[]> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    lead_id: string;
    intent: string | null;
    need: string | null;
    budget_value: string | null;
    budget_text: string | null;
    location: string | null;
    score: number;
    score_band: LeadScoreBand;
    score_reasons: string[];
    created_at: Date;
  }>(
    `select *
       from lead_intelligence_history
      where tenant_id = $1
        and lead_id = $2
      order by created_at desc
      limit $3`,
    [tenantId, leadId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    intent: row.intent,
    need: row.need,
    budgetValue: row.budget_value === null ? null : Number(row.budget_value),
    budgetText: row.budget_text,
    location: row.location,
    score: Number(row.score),
    scoreBand: row.score_band,
    scoreReasons: row.score_reasons ?? [],
    createdAt: row.created_at,
  }));
}
