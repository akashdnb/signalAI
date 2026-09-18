import type { Pool } from "pg";

export async function getCapturedFacts(pool: Pool, tenantId: string, leadId: string): Promise<Record<string, string>> {
  const result = await pool.query<{ facts: Record<string, string> }>(
    `select facts from lead_captured_facts where lead_id = $1 and tenant_id = $2`,
    [leadId, tenantId],
  );
  return result.rows[0]?.facts ?? {};
}

/** Merges into whatever's already captured — a lead's email captured at milestone 1 survives milestone 3 capturing a budget. */
export async function mergeCapturedFacts(
  pool: Pool,
  tenantId: string,
  leadId: string,
  newFacts: Record<string, string>,
): Promise<void> {
  await pool.query(
    `insert into lead_captured_facts (lead_id, tenant_id, facts)
     values ($1, $2, $3)
     on conflict (lead_id) do update set facts = lead_captured_facts.facts || excluded.facts, updated_at = now()`,
    [leadId, tenantId, JSON.stringify(newFacts)],
  );
}

/** Part of the same hard-scrub deletion path as lead_pii — captured facts (email, phone, budget) are PII too. */
export async function hardScrubCapturedFacts(pool: Pool, leadId: string): Promise<void> {
  await pool.query(
    `update lead_captured_facts set facts = '{}', deleted_at = now() where lead_id = $1`,
    [leadId],
  );
}
