import { describe, expect, it } from "vitest";
import { estimateOverageCost } from "../overage.js";

describe("estimateOverageCost (Phase 2B Overage Pricing Bands — dashboard estimate, not authoritative billing)", () => {
  it("returns 0 for no overage", () => {
    expect(estimateOverageCost(0)).toBe(0);
    expect(estimateOverageCost(-100)).toBe(0);
  });

  it("prices entirely within the first band", () => {
    // 500,000 tokens at $0.002/1000 = $1.00
    expect(estimateOverageCost(500_000)).toBe(1.0);
  });

  it("prices exactly at the first band's boundary", () => {
    // 1,000,000 tokens at $0.002/1000 = $2.00
    expect(estimateOverageCost(1_000_000)).toBe(2.0);
  });

  it("splits across bands once overage exceeds the first band's ceiling", () => {
    // First 1,000,000 at $0.002/1000 = $2.00, next 500,000 at $0.0015/1000 = $0.75
    expect(estimateOverageCost(1_500_000)).toBe(2.75);
  });

  it("is monotonically non-decreasing as overage grows", () => {
    const small = estimateOverageCost(100_000);
    const large = estimateOverageCost(2_000_000);
    expect(large).toBeGreaterThan(small);
  });
});
