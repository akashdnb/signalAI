import { describe, expect, it } from "vitest";
import { calculateLeadScore, parseBudgetValue } from "../leadScoring.js";
import type { LeadScoringRule } from "../../db/leadScoringRules.js";

describe("calculateLeadScore", () => {
  it("starts cold with no qualification or engagement signals", () => {
    expect(
      calculateLeadScore({
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
      }),
    ).toEqual({
      score: 0,
      scoreBand: "cold",
      reasons: [],
    });
  });

  it("scores qualification fields deterministically", () => {
    const result = calculateLeadScore({
      intent: "ready_to_buy",
      need: "3BHK apartment",
      budget: "15000000",
      location: "Bangalore",
      inboundEventsLast7Days: 0,
      milestonesAdvanced: 0,
    });

    expect(result.score).toBe(75);
    expect(result.scoreBand).toBe("hot");
    expect(result.reasons).toEqual([
      "Intent ready_to_buy +25",
      "Need captured +20",
      "Budget captured +20",
      "Location captured +10",
    ]);
  });

  it("caps engagement and milestone progress", () => {
    const result = calculateLeadScore({
      intent: "ready_to_buy",
      need: "home",
      budget: "10000000",
      location: "Bangalore",
      inboundEventsLast7Days: 20,
      milestonesAdvanced: 20,
    });

    expect(result.score).toBe(100);
    expect(result.scoreBand).toBe("very_hot");
    expect(result.reasons).toContain("Recent engagement +15");
    expect(result.reasons).toContain("Milestone progress +10");
  });

  it("moves through score bands at documented thresholds", () => {
    expect(
      calculateLeadScore({
        intent: "buying",
        inboundEventsLast7Days: 2,
        milestonesAdvanced: 0,
      }).scoreBand,
    ).toBe("warm");

    expect(
      calculateLeadScore({
        intent: "buying",
        need: "home",
        inboundEventsLast7Days: 5,
        milestonesAdvanced: 0,
      }).scoreBand,
    ).toBe("hot");

    expect(
      calculateLeadScore({
        intent: "buying",
        need: "home",
        budget: "10000000",
        location: "Bangalore",
        inboundEventsLast7Days: 2,
        milestonesAdvanced: 0,
      }).scoreBand,
    ).toBe("very_hot");
  });

  describe("custom scoring rules", () => {
    function rule(overrides: Partial<LeadScoringRule> = {}): LeadScoringRule {
      return {
        id: "rule-1",
        tenantId: "tenant-1",
        name: "Big budget bonus",
        definition: { kind: "field_compare", field: "budget_value", operator: "gte", value: 10000000 },
        points: 10,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it("applies a matching field_compare rule and names it in reasons", () => {
      const result = calculateLeadScore({
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        budgetValue: 15_000_000,
        customRules: [rule()],
      });

      expect(result.score).toBe(10);
      expect(result.reasons).toContain('Rule "Big budget bonus" +10');
    });

    it("does not apply a non-matching field_compare rule", () => {
      const result = calculateLeadScore({
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        budgetValue: 5_000_000,
        customRules: [rule()],
      });

      expect(result.score).toBe(0);
      expect(result.reasons).toEqual([]);
    });

    it("applies a matching milestone_completed rule", () => {
      const result = calculateLeadScore({
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        completedMilestoneIds: new Set(["milestone-abc"]),
        customRules: [rule({ definition: { kind: "milestone_completed", milestoneId: "milestone-abc" }, points: 10 })],
      });

      expect(result.score).toBe(10);
      expect(result.reasons).toContain('Rule "Big budget bonus" +10');
    });

    it("applies a negative rule (e.g. not_interested penalty) without going below 0", () => {
      const result = calculateLeadScore({
        intent: "ready_to_buy",
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        customRules: [rule({ definition: { kind: "field_compare", field: "intent", operator: "eq", value: "not_interested" }, points: -40 })],
      });

      // intent is ready_to_buy, not not_interested, so this rule doesn't match
      expect(result.score).toBe(25);

      const penalized = calculateLeadScore({
        intent: "not_interested",
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        customRules: [rule({ definition: { kind: "field_compare", field: "intent", operator: "eq", value: "not_interested" }, points: -40 })],
      });
      expect(penalized.score).toBe(0);
    });

    it("never pushes the final score above 100, even with multiple positive rules", () => {
      const result = calculateLeadScore({
        intent: "ready_to_buy",
        need: "home",
        budget: "10000000",
        location: "Bangalore",
        inboundEventsLast7Days: 20,
        milestonesAdvanced: 20,
        budgetValue: 15_000_000,
        customRules: [rule({ points: 50 }), rule({ id: "rule-2", name: "Another bonus", points: 50 })],
      });

      expect(result.score).toBe(100);
    });

    it("ignores a disabled rule", () => {
      const result = calculateLeadScore({
        inboundEventsLast7Days: 0,
        milestonesAdvanced: 0,
        budgetValue: 15_000_000,
        customRules: [rule({ enabled: false })],
      });

      expect(result.score).toBe(0);
      expect(result.reasons).toEqual([]);
    });

    it("evaluates deterministically — same input always produces the same result", () => {
      const input = {
        intent: "high_intent",
        budgetValue: 20_000_000,
        inboundEventsLast7Days: 1,
        milestonesAdvanced: 0,
        customRules: [rule()],
      };

      const a = calculateLeadScore(input);
      const b = calculateLeadScore(input);
      expect(a).toEqual(b);
    });
  });
});

describe("parseBudgetValue", () => {
  it("parses common Indian currency formats", () => {
    expect(parseBudgetValue("₹1.5 crore")).toBe(15_000_000);
    expect(parseBudgetValue("1.5 cr")).toBe(15_000_000);
    expect(parseBudgetValue("₹50 lakh")).toBe(5_000_000);
    expect(parseBudgetValue("50 lac")).toBe(5_000_000);
    expect(parseBudgetValue("₹20L")).toBe(2_000_000);
    expect(parseBudgetValue("5000")).toBe(5000);
    expect(parseBudgetValue("INR 5000")).toBe(5000);
    expect(parseBudgetValue("Rs. 5000")).toBe(5000);
    expect(parseBudgetValue("10k")).toBe(10_000);
  });

  it("does not misinterpret vague budget language as an exact number", () => {
    expect(parseBudgetValue("around 1 crore")).toBeNull();
    expect(parseBudgetValue("under 1 crore")).toBeNull();
    expect(parseBudgetValue("1-2 crore")).toBeNull();
    expect(parseBudgetValue("whatever it takes")).toBeNull();
  });

  it("returns null for empty/null input", () => {
    expect(parseBudgetValue(null)).toBeNull();
    expect(parseBudgetValue("")).toBeNull();
  });
});
