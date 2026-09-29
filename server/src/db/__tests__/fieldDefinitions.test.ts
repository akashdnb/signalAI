import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinitionValueTypes,
  listFieldDefinitions,
  updateFieldDefinition,
} from "../fieldDefinitions.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("tenant field definitions", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates a field definition and lists it back ordered by field_key", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await createFieldDefinition(pool, tenant.id, { fieldKey: "user_country", label: "Country", valueType: "country" });
    await createFieldDefinition(pool, tenant.id, { fieldKey: "budget", label: "Budget", valueType: "number" });

    const definitions = await listFieldDefinitions(pool, tenant.id);
    expect(definitions.map((d) => d.fieldKey)).toEqual(["budget", "user_country"]);
    expect(definitions[0]).toMatchObject({ fieldKey: "budget", label: "Budget", valueType: "number", tenantId: tenant.id });
  });

  it("updates label and valueType, leaving the other untouched when omitted", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const created = await createFieldDefinition(pool, tenant.id, {
      fieldKey: "email",
      label: "Email",
      valueType: "email",
    });

    const updated = await updateFieldDefinition(pool, tenant.id, created.id, { label: "Work Email" });
    expect(updated).toMatchObject({ label: "Work Email", valueType: "email" });

    const updated2 = await updateFieldDefinition(pool, tenant.id, created.id, { valueType: "text" });
    expect(updated2).toMatchObject({ label: "Work Email", valueType: "text" });
  });

  it("returns null updating a field definition that doesn't exist for that tenant", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const other = await createTenant(pool, "creator-b");
    const created = await createFieldDefinition(pool, other.id, { fieldKey: "email", label: "Email", valueType: "email" });

    const result = await updateFieldDefinition(pool, tenant.id, created.id, { label: "Nope" });
    expect(result).toBeNull();
  });

  it("deletes a field definition and reports whether a row was actually removed", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const created = await createFieldDefinition(pool, tenant.id, { fieldKey: "email", label: "Email", valueType: "email" });

    const deleted = await deleteFieldDefinition(pool, tenant.id, created.id);
    expect(deleted).toBe(true);

    const deletedAgain = await deleteFieldDefinition(pool, tenant.id, created.id);
    expect(deletedAgain).toBe(false);

    expect(await listFieldDefinitions(pool, tenant.id)).toEqual([]);
  });

  it("enforces uniqueness on (tenant_id, field_key)", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await createFieldDefinition(pool, tenant.id, { fieldKey: "email", label: "Email", valueType: "email" });

    await expect(
      createFieldDefinition(pool, tenant.id, { fieldKey: "email", label: "Email Again", valueType: "text" }),
    ).rejects.toThrow();
  });

  it("allows the same field_key across different tenants", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");

    await createFieldDefinition(pool, tenantA.id, { fieldKey: "email", label: "Email", valueType: "email" });
    await expect(
      createFieldDefinition(pool, tenantB.id, { fieldKey: "email", label: "Email", valueType: "email" }),
    ).resolves.toBeTruthy();
  });

  it("rejects a fieldKey that isn't a short identifier", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await expect(
      createFieldDefinition(pool, tenant.id, { fieldKey: "email address; DROP TABLE leads", label: "Email", valueType: "email" }),
    ).rejects.toThrow();
  });

  it("rejects an invalid valueType", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await expect(
      createFieldDefinition(pool, tenant.id, { fieldKey: "email", label: "Email", valueType: "not_a_real_type" }),
    ).rejects.toThrow();
  });

  it("rejects an empty label", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await expect(
      createFieldDefinition(pool, tenant.id, { fieldKey: "email", label: "   ", valueType: "email" }),
    ).rejects.toThrow();
  });

  it("getFieldDefinitionValueTypes returns the right flat map", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await createFieldDefinition(pool, tenant.id, { fieldKey: "user_country", label: "Country", valueType: "country" });
    await createFieldDefinition(pool, tenant.id, { fieldKey: "budget", label: "Budget", valueType: "number" });

    const map = await getFieldDefinitionValueTypes(pool, tenant.id);
    expect(map).toEqual({ user_country: "country", budget: "number" });
  });

  it("getFieldDefinitionValueTypes returns an empty map for a tenant with no definitions", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    const map = await getFieldDefinitionValueTypes(pool, tenant.id);
    expect(map).toEqual({});
  });
});
