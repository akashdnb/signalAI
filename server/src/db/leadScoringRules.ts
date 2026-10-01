import type { Pool } from "pg";
import type { Queryable } from "./types.js";
import { getMilestone } from "./milestones.js";

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

/**
 * Only budget_value has numeric semantics — intent/need/location are
 * free/canonical text with no meaningful ordering, so gte/lte on them would
 * silently never match (every lead would just fail the rule forever). This
 * is the validation matrix the route/tests enforce: a field only accepts
 * the operators whose comparison actually makes sense for its value type.
 */
const NUMERIC_FIELDS: ReadonlySet<ScoringRuleField> = new Set(["budget_value"]);
const STRING_ONLY_OPERATORS: ReadonlySet<ScoringRuleOperator> = new Set(["eq", "exists"]);

const FIELD_COMPARE_ALLOWED_KEYS = new Set(["kind", "field", "operator", "value"]);
const MILESTONE_COMPLETED_ALLOWED_KEYS = new Set(["kind", "milestoneId"]);

function assertNoUnexpectedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`definition has unexpected propert${unexpected.length === 1 ? "y" : "ies"}: ${unexpected.join(", ")}`);
  }
}

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
    assertNoUnexpectedKeys(value, FIELD_COMPARE_ALLOWED_KEYS);

    if (!SCORING_RULE_FIELDS.includes(value.field as ScoringRuleField)) {
      throw new Error(`definition.field must be one of: ${SCORING_RULE_FIELDS.join(", ")}`);
    }
    if (!SCORING_RULE_OPERATORS.includes(value.operator as ScoringRuleOperator)) {
      throw new Error(`definition.operator must be one of: ${SCORING_RULE_OPERATORS.join(", ")}`);
    }
    const field = value.field as ScoringRuleField;
    const operator = value.operator as ScoringRuleOperator;
    const isNumericField = NUMERIC_FIELDS.has(field);

    if (operator === "exists") {
      if (value.value !== undefined) {
        throw new Error('definition.value must not be supplied when operator is "exists"');
      }
      return { kind: "field_compare", field, operator };
    }

    // Only a numeric field has meaningful gte/lte ordering — intent/need/
    // location are text-only, so gte/lte on them is rejected outright
    // rather than silently stored as a rule that can never match.
    if (!isNumericField && !STRING_ONLY_OPERATORS.has(operator)) {
      throw new Error(`definition.operator "${operator}" is not valid for field "${field}" — text fields only support "eq" and "exists"`);
    }

    const fieldValue = value.value;
    if (isNumericField) {
      if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
        throw new Error(`definition.value must be a finite number for field "${field}"`);
      }
      return { kind: "field_compare", field, operator, value: fieldValue };
    }

    // A text field (intent/need/location) never accepts a numeric value —
    // "intent eq 10" can never match a lead's normalized text intent.
    if (typeof fieldValue !== "string") {
      throw new Error(`definition.value must be a string for field "${field}"`);
    }
    const trimmed = fieldValue.trim();
    if (!trimmed || trimmed.length > MAX_STRING_VALUE_LENGTH) {
      throw new Error(`definition.value must be a non-empty string of at most ${MAX_STRING_VALUE_LENGTH} characters`);
    }
    return { kind: "field_compare", field, operator, value: trimmed };
  }

  if (value.kind === "milestone_completed") {
    assertNoUnexpectedKeys(value, MILESTONE_COMPLETED_ALLOWED_KEYS);

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

/**
 * Strict boolean validation — `!!value` previously coerced "false" (a
 * string) to `true`, letting a client that mis-serializes a form field
 * silently create an ENABLED rule when they asked for disabled. Only the
 * actual JSON boolean values are ever accepted; `undefined` (field
 * omitted) returns `undefined` so the route can tell "not provided" apart
 * from an explicit `false` — POST defaults that to `true`, PATCH leaves
 * the existing value unchanged.
 */
export function validateOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${fieldName} must be a boolean`);
  return value;
}

/**
 * Distinguished from a plain Error specifically so route code can tell
 * "this milestoneId is invalid" (a 400) apart from an infra failure in the
 * lookup itself — a DB connection error from getMilestone must still
 * surface as a 500, never get reinterpreted as bad input.
 */
export class ScoringRuleMilestoneNotFoundError extends Error {}

/**
 * Configuration validation, not scoring evaluation (leadScoring.ts does
 * that): a `milestone_completed` rule's `milestoneId` was previously only
 * checked for UUID *syntax* — a well-formed but nonexistent id, a
 * soft-deleted milestone, or (critically) a milestone belonging to a
 * DIFFERENT tenant would all be silently accepted and stored. Reuses the
 * existing tenant-scoped, soft-delete-aware lookup (db/milestones.ts) —
 * same boundary every other tenant-scoped table in this schema uses, never
 * a bespoke milestone query here. No-op for a field_compare definition.
 */
export async function assertScoringRuleMilestoneOwnership(
  pool: Pool,
  tenantId: string,
  definition: ScoringRuleDefinition,
): Promise<void> {
  if (definition.kind !== "milestone_completed") return;
  const milestone = await getMilestone(pool, tenantId, definition.milestoneId);
  if (!milestone) {
    throw new ScoringRuleMilestoneNotFoundError(
      "definition.milestoneId does not reference an active milestone belonging to this tenant",
    );
  }
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
