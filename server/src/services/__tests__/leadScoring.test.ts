import { describe, expect, it } from "vitest";
import { calculateLeadScore } from "../leadScoring.js";

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
      "Intent captured +25",
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
});
