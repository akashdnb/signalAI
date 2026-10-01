import type { Queryable } from "./types.js";

/**
 * Structured, non-executable rule records — never an arbitrary expression
 * or code string. "field_compare" checks one scoring signal against a
 * literal value; "milestone_completed" checks whether a specific milestone
 * has been reached. See leadScoring.ts's applyCustomScoringRules for
 * evaluation.
 */
export type ScoringRuleField = "budget_value" | "intent" | "need" | "location";
export type ScoringRuleOperator = "gte" | "lte" | "eq" | "exists";

export type ScoringRuleDefinition =
  | { kind: "field_compare"; field: ScoringRuleField; operator: ScoringRuleOperator; value?: number | string }
  | { kind: "milestone_completed"; milestoneId: string };

export interface LeadScoringRule {
  id: string;
  tenantId: string;
  name: string;
  definition: ScoringRuleDefinition;
  points: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface LeadScoringRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  definition: unknown;
  points: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

const SCORING_RULE_FIELDS: readonly ScoringRuleField[] = ["budget_value", "intent", "need", "location"];
const SCORING_RULE_OPERATORS: readonly ScoringRuleOperator[] = ["gte", "lte", "eq", "exists"];
const MAX_NAME_LENGTH = 100;
const MAX_STRING_VALUE_LENGTH = 200;
const MILESTONE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRule(row: LeadScoringRuleRow): LeadScoringRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    definition: row.definition as ScoringRuleDefinition,
    points: row.points,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validates untrusted (tenant-authored, API-supplied) input into a
 * ScoringRuleDefinition. Throws on anything malformed — callers (the route)
 * turn that into a 400, never a 500 or a silently-accepted bad rule.
 * Deliberately rejects anything that isn't exactly one of the two known
 * shapes: no eval, no free-form expressions, nothing executable.
 */
export function validateScoringRuleDefinition(raw: unknown): ScoringRuleDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("definition must be an object");
  }
  const value = raw as Record<string, unknown>;

  if (value.kind === "field_compare") {
    if (!SCORING_RULE_FIELDS.includes(value.field as ScoringRuleField)) {
      throw new Error(`definition.field must be one of: ${SCORING_RULE_FIELDS.join(", ")}`);
    }
    if (!SCORING_RULE_OPERATORS.includes(value.operator as ScoringRuleOperator)) {
      throw new Error(`definition.operator must be one of: ${SCORING_RULE_OPERATORS.join(", ")}`);
    }
    const operator = value.operator as ScoringRuleOperator;
    if (operator === "exists") {
      return { kind: "field_compare", field: value.field as ScoringRuleField, operator };
    }
    const fieldValue = value.value;
    if (typeof fieldValue === "number") {
      if (!Number.isFinite(fieldValue)) throw new Error("definition.value must be a finite number");
      return { kind: "field_compare", field: value.field as ScoringRuleField, operator, value: fieldValue };
    }
    if (typeof fieldValue === "string") {
      const trimmed = fieldValue.trim();
      if (!trimmed || trimmed.length > MAX_STRING_VALUE_LENGTH) {
        throw new Error(`definition.value must be a non-empty string of at most ${MAX_STRING_VALUE_LENGTH} characters`);
      }
      return { kind: "field_compare", field: value.field as ScoringRuleField, operator, value: trimmed };
    }
    throw new Error("definition.value must be a number or string for this operator");
  }

  if (value.kind === "milestone_completed") {
    if (typeof value.milestoneId !== "string" || !MILESTONE_ID_PATTERN.test(value.milestoneId)) {
      throw new Error("definition.milestoneId must be a valid uuid");
    }
    return { kind: "milestone_completed", milestoneId: value.milestoneId };
  }

  throw new Error('definition.kind must be "field_compare" or "milestone_completed"');
}

export function validateScoringRuleName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("name must be a non-empty string");
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`name must be at most ${MAX_NAME_LENGTH} characters`);
  return trimmed;
}

export function validateScoringRulePoints(points: unknown): number {
  if (typeof points !== "number" || !Number.isInteger(points) || points < -100 || points > 100) {
    throw new Error("points must be an integer between -100 and 100");
  }
  return points;
}

/** Tenant-isolated: every query below is scoped by tenant_id, never by id alone. */
export async function listScoringRules(pool: Queryable, tenantId: string, onlyEnabled = false): Promise<LeadScoringRule[]> {
  const result = await pool.query<LeadScoringRuleRow>(
    onlyEnabled
      ? `select * from lead_scoring_rules where tenant_id = $1 and enabled = true order by created_at`
      : `select * from lead_scoring_rules where tenant_id = $1 order by created_at`,
    [tenantId],
  );
  return result.rows.map(toRule);
}

export async function createScoringRule(
  pool: Queryable,
  tenantId: string,
  params: { name: string; definition: ScoringRuleDefinition; points: number; enabled?: boolean },
): Promise<LeadScoringRule> {
  const result = await pool.query<LeadScoringRuleRow>(
    `insert into lead_scoring_rules (tenant_id, name, definition, points, enabled)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [tenantId, params.name, JSON.stringify(params.definition), params.points, params.enabled ?? true],
  );
  return toRule(result.rows[0]!);
}

export async function updateScoringRule(
  pool: Queryable,
  tenantId: string,
  id: string,
  params: { name?: string; definition?: ScoringRuleDefinition; points?: number; enabled?: boolean },
): Promise<LeadScoringRule | null> {
  const result = await pool.query<LeadScoringRuleRow>(
    `update lead_scoring_rules
     set name = coalesce($3, name),
         definition = coalesce($4, definition),
         points = coalesce($5, points),
         enabled = coalesce($6, enabled),
         updated_at = now()
     where id = $1 and tenant_id = $2
     returning *`,
    [
      id,
      tenantId,
      params.name ?? null,
      params.definition ? JSON.stringify(params.definition) : null,
      params.points ?? null,
      params.enabled ?? null,
    ],
  );
  return result.rows[0] ? toRule(result.rows[0]) : null;
}

export async function deleteScoringRule(pool: Queryable, tenantId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from lead_scoring_rules where id = $1 and tenant_id = $2`, [id, tenantId]);
  return (result.rowCount ?? 0) > 0;
}
