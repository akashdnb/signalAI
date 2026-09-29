import type { Queryable } from "./types.js";

export type FieldDefinitionValueType = "email" | "phone" | "country" | "number" | "date" | "text";

const VALUE_TYPES: readonly FieldDefinitionValueType[] = ["email", "phone", "country", "number", "date", "text"];

// Same identifier rule as milestones.ts's captureField check — a field
// definition's key is used the same way a captureField entry is (an
// object key threaded through the milestone engine's prompt and validation
// map), so it must satisfy the same "short identifier" shape.
const FIELD_KEY_PATTERN = /^[a-zA-Z0-9_]{1,50}$/;
const MAX_LABEL_LENGTH = 100;

export interface FieldDefinition {
  id: string;
  tenantId: string;
  fieldKey: string;
  label: string;
  valueType: FieldDefinitionValueType;
  createdAt: Date;
  updatedAt: Date;
}

interface FieldDefinitionRow {
  id: string;
  tenant_id: string;
  field_key: string;
  label: string;
  value_type: FieldDefinitionValueType;
  created_at: Date;
  updated_at: Date;
}

function toFieldDefinition(row: FieldDefinitionRow): FieldDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fieldKey: row.field_key,
    label: row.label,
    valueType: row.value_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateFieldKey(fieldKey: string): void {
  if (!FIELD_KEY_PATTERN.test(fieldKey)) {
    throw new Error("fieldKey must be a short identifier (letters, digits, underscore only, 1-50 characters)");
  }
}

function validateLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("label must not be empty");
  }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    throw new Error(`label must be at most ${MAX_LABEL_LENGTH} characters`);
  }
  return trimmed;
}

function validateValueType(valueType: string): FieldDefinitionValueType {
  if (!VALUE_TYPES.includes(valueType as FieldDefinitionValueType)) {
    throw new Error(`valueType must be one of: ${VALUE_TYPES.join(", ")}`);
  }
  return valueType as FieldDefinitionValueType;
}

export async function listFieldDefinitions(pool: Queryable, tenantId: string): Promise<FieldDefinition[]> {
  const result = await pool.query<FieldDefinitionRow>(
    `select * from tenant_field_definitions where tenant_id = $1 order by field_key`,
    [tenantId],
  );
  return result.rows.map(toFieldDefinition);
}

export async function createFieldDefinition(
  pool: Queryable,
  tenantId: string,
  params: { fieldKey: string; label: string; valueType: string },
): Promise<FieldDefinition> {
  validateFieldKey(params.fieldKey);
  const label = validateLabel(params.label);
  const valueType = validateValueType(params.valueType);

  const result = await pool.query<FieldDefinitionRow>(
    `insert into tenant_field_definitions (tenant_id, field_key, label, value_type)
     values ($1, $2, $3, $4) returning *`,
    [tenantId, params.fieldKey, label, valueType],
  );
  return toFieldDefinition(result.rows[0]!);
}

export async function updateFieldDefinition(
  pool: Queryable,
  tenantId: string,
  id: string,
  params: { label?: string; valueType?: string },
): Promise<FieldDefinition | null> {
  const label = params.label !== undefined ? validateLabel(params.label) : undefined;
  const valueType = params.valueType !== undefined ? validateValueType(params.valueType) : undefined;

  const result = await pool.query<FieldDefinitionRow>(
    `update tenant_field_definitions
     set label = coalesce($3, label),
         value_type = coalesce($4, value_type),
         updated_at = now()
     where id = $1 and tenant_id = $2
     returning *`,
    [id, tenantId, label ?? null, valueType ?? null],
  );
  return result.rows[0] ? toFieldDefinition(result.rows[0]) : null;
}

export async function deleteFieldDefinition(pool: Queryable, tenantId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from tenant_field_definitions where id = $1 and tenant_id = $2`, [
    id,
    tenantId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Flat `fieldKey -> valueType` map for the whole tenant — used by
 * milestoneEngine.ts to validate captured values against a registered type
 * without that file needing to know about the full FieldDefinition shape.
 */
export async function getFieldDefinitionValueTypes(
  pool: Queryable,
  tenantId: string,
): Promise<Record<string, FieldDefinitionValueType>> {
  const definitions = await listFieldDefinitions(pool, tenantId);
  return Object.fromEntries(definitions.map((def) => [def.fieldKey, def.valueType]));
}
