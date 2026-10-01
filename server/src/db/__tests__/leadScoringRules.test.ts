import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import {
  createScoringRule,
  deleteScoringRule,
  listScoringRules,
  updateScoringRule,
  validateScoringRuleDefinition,
  validateScoringRuleName,
  validateScoringRulePoints,
} from "../leadScoringRules.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("lead scoring rules", () => {
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

  describe("validateScoringRuleDefinition", () => {
    it("accepts a valid field_compare rule", () => {
      expect(validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "gte", value: 10000000 })).toEqual({
        kind: "field_compare",
        field: "budget_value",
        operator: "gte",
        value: 10000000,
      });
    });

    it("accepts a valid milestone_completed rule", () => {
      const milestoneId = "123e4567-e89b-12d3-a456-426614174000";
      expect(validateScoringRuleDefinition({ kind: "milestone_completed", milestoneId })).toEqual({
        kind: "milestone_completed",
        milestoneId,
      });
    });

    it("rejects an unknown kind", () => {
      expect(() => validateScoringRuleDefinition({ kind: "eval", code: "1+1" })).toThrow();
    });

    it("rejects an invalid field", () => {
      expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "password", operator: "eq", value: "x" })).toThrow();
    });

    it("rejects an invalid operator", () => {
      expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "DROP TABLE", value: 1 })).toThrow();
    });

    it("rejects a milestone_completed rule with a non-uuid milestoneId", () => {
      expect(() => validateScoringRuleDefinition({ kind: "milestone_completed", milestoneId: "not-a-uuid" })).toThrow();
    });

    it("rejects a non-object definition", () => {
      expect(() => validateScoringRuleDefinition("eval('1+1')")).toThrow();
      expect(() => validateScoringRuleDefinition(null)).toThrow();
    });

    // Required validation matrix (follow-up spec Objective A): only
    // budget_value has numeric/ordering semantics; intent/need/location are
    // text-only and may only be compared with eq/exists.
    describe("validation matrix", () => {
      it("accepts budget_value with exists, eq, gte, lte against a number", () => {
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "exists" })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "eq", value: 500000 })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "gte", value: 10000000 })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "lte", value: 10000000 })).toBeTruthy();
      });

      it("rejects a string value for budget_value under any operator", () => {
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "gte", value: "₹1Cr" })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "eq", value: "500000" })).toThrow();
      });

      it("accepts intent with exists and eq against a string, rejects gte/lte and numeric value", () => {
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "exists" })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" })).toBeTruthy();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "gte", value: "ready_to_buy" })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "lte", value: "ready_to_buy" })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "eq", value: 10 })).toThrow();
      });

      it("accepts need with exists and eq against a string, rejects gte/lte and numeric value", () => {
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "need", operator: "exists" })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "need", operator: "eq", value: "3BHK apartment" })).toBeTruthy();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "need", operator: "gte", value: "x" })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "need", operator: "eq", value: 5 })).toThrow();
      });

      it("accepts location with exists and eq against a string, rejects gte/lte and numeric value", () => {
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "location", operator: "exists" })).toBeTruthy();
        expect(validateScoringRuleDefinition({ kind: "field_compare", field: "location", operator: "eq", value: "Bangalore" })).toBeTruthy();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "location", operator: "gte", value: "Bangalore" })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "location", operator: "eq", value: 1 })).toThrow();
      });

      it("rejects exists with a value supplied, rather than silently discarding it", () => {
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "budget_value", operator: "exists", value: 1 })).toThrow();
        expect(() => validateScoringRuleDefinition({ kind: "field_compare", field: "intent", operator: "exists", value: "ready_to_buy" })).toThrow();
      });

      it("rejects unexpected properties on a field_compare definition", () => {
        expect(() =>
          validateScoringRuleDefinition({
            kind: "field_compare",
            field: "budget_value",
            operator: "gte",
            value: 1,
            script: "require('fs')",
          }),
        ).toThrow();
      });

      it("rejects unexpected properties on a milestone_completed definition", () => {
        const milestoneId = "123e4567-e89b-12d3-a456-426614174000";
        expect(() => validateScoringRuleDefinition({ kind: "milestone_completed", milestoneId, points: 999 })).toThrow();
      });

      it("rejects an unexpected rule kind", () => {
        expect(() => validateScoringRuleDefinition({ kind: "expression", code: "lead.score * 2" })).toThrow();
      });
    });
  });

  describe("validateScoringRulePoints", () => {
    it("rejects points outside -100..100", () => {
      expect(() => validateScoringRulePoints(101)).toThrow();
      expect(() => validateScoringRulePoints(-101)).toThrow();
      expect(() => validateScoringRulePoints(1.5)).toThrow();
    });

    it("accepts negative points (e.g. a not_interested penalty)", () => {
      expect(validateScoringRulePoints(-10)).toBe(-10);
    });
  });

  describe("validateScoringRuleName", () => {
    it("rejects an empty name", () => {
      expect(() => validateScoringRuleName("  ")).toThrow();
    });
  });

  it("creates, lists, updates, and deletes a rule, scoped to its tenant", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");

    const rule = await createScoringRule(pool, tenantA.id, {
      name: "Big budget bonus",
      definition: { kind: "field_compare", field: "budget_value", operator: "gte", value: 10000000 },
      points: 10,
    });
    expect(rule.enabled).toBe(true);

    // Tenant isolation: tenant B's listing must never see tenant A's rule.
    expect(await listScoringRules(pool, tenantB.id)).toEqual([]);
    expect((await listScoringRules(pool, tenantA.id)).map((r) => r.id)).toEqual([rule.id]);

    // Tenant isolation: an update/delete scoped to the wrong tenant is a no-op.
    expect(await updateScoringRule(pool, tenantB.id, rule.id, { points: 99 })).toBeNull();
    expect(await deleteScoringRule(pool, tenantB.id, rule.id)).toBe(false);

    const updated = await updateScoringRule(pool, tenantA.id, rule.id, { points: 20, enabled: false });
    expect(updated).toMatchObject({ points: 20, enabled: false });

    expect(await deleteScoringRule(pool, tenantA.id, rule.id)).toBe(true);
    expect(await listScoringRules(pool, tenantA.id)).toEqual([]);
  });

  it("listScoringRules(onlyEnabled) excludes disabled rules", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-c");

    await createScoringRule(pool, tenant.id, {
      name: "Enabled rule",
      definition: { kind: "field_compare", field: "location", operator: "exists" },
      points: 5,
      enabled: true,
    });
    await createScoringRule(pool, tenant.id, {
      name: "Disabled rule",
      definition: { kind: "field_compare", field: "location", operator: "exists" },
      points: 5,
      enabled: false,
    });

    const onlyEnabled = await listScoringRules(pool, tenant.id, true);
    expect(onlyEnabled.map((r) => r.name)).toEqual(["Enabled rule"]);

    const all = await listScoringRules(pool, tenant.id);
    expect(all).toHaveLength(2);
  });
});
