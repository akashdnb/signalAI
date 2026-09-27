import type { Queryable } from "./types.js";

/**
 * Phase 2C Client Guardrails: per-tenant configuration that can only
 * NARROW Phase 1's Global Guardrails (lib/guardrails.ts), never override
 * them — this module is a plain data store, with no notion of "disabled."
 * An absent row (getGuardrailsConfig returning null) means "nothing
 * configured yet," which callers must treat identically to an empty
 * config, never as an opt-out.
 */
export interface TenantGuardrailsConfig {
  tenantId: string;
  brandVoice: string | null;
  forbiddenTopics: string[];
  escalationTriggers: string[];
  updatedAt: Date;
}

interface TenantGuardrailsConfigRow {
  tenant_id: string;
  brand_voice: string | null;
  forbidden_topics: string[];
  escalation_triggers: string[];
  updated_at: Date;
}

function toConfig(row: TenantGuardrailsConfigRow): TenantGuardrailsConfig {
  return {
    tenantId: row.tenant_id,
    brandVoice: row.brand_voice,
    forbiddenTopics: row.forbidden_topics,
    escalationTriggers: row.escalation_triggers,
    updatedAt: row.updated_at,
  };
}

export async function getGuardrailsConfig(pool: Queryable, tenantId: string): Promise<TenantGuardrailsConfig | null> {
  const result = await pool.query<TenantGuardrailsConfigRow>(
    `select * from tenant_guardrails_config where tenant_id = $1`,
    [tenantId],
  );
  return result.rows[0] ? toConfig(result.rows[0]) : null;
}

export async function upsertGuardrailsConfig(
  pool: Queryable,
  params: { tenantId: string; brandVoice: string | null; forbiddenTopics: string[]; escalationTriggers: string[] },
): Promise<TenantGuardrailsConfig> {
  const result = await pool.query<TenantGuardrailsConfigRow>(
    `insert into tenant_guardrails_config (tenant_id, brand_voice, forbidden_topics, escalation_triggers, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (tenant_id) do update set
       brand_voice = excluded.brand_voice,
       forbidden_topics = excluded.forbidden_topics,
       escalation_triggers = excluded.escalation_triggers,
       updated_at = now()
     returning *`,
    [params.tenantId, params.brandVoice, JSON.stringify(params.forbiddenTopics), JSON.stringify(params.escalationTriggers)],
  );
  return toConfig(result.rows[0]!);
}
