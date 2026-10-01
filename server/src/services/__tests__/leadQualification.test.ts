import { describe, expect, it } from "vitest";
import {
  normalizeQualification,
  qualificationToCapturedFacts,
} from "../leadQualification.js";

describe("lead qualification", () => {
  it("normalizes a complete explicit qualification", () => {
    expect(
      normalizeQualification({
        intent: "buying-now",
        need: "3BHK apartment",
        budget: "₹1.5 crore",
        location: "Bangalore",
      }),
    ).toEqual({
      intent: "ready_to_buy",
      need: "3BHK apartment",
      budget: "₹1.5 crore",
      location: "Bangalore",
    });
  });

  it("drops ambiguous and refusal values", () => {
    expect(
      normalizeQualification({
        intent: "unknown",
        need: "none",
        budget: "",
        location: "Bangalore",
      }),
    ).toEqual({
      location: "Bangalore",
    });
  });

  it("maps qualification to canonical captured-fact keys", () => {
    expect(
      qualificationToCapturedFacts({
        intent: "high_intent",
        need: "enterprise CRM",
        budget: "5000",
        location: "Mumbai",
      }),
    ).toEqual({
      intent: "high_intent",
      need: "enterprise CRM",
      budget: "5000",
      location: "Mumbai",
    });
  });
});
