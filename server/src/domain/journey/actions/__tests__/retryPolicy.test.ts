import { describe, expect, it } from "vitest";

import {
  getRetryAt,
  getRetryDelaySeconds,
  type JourneyActionRetryPolicy,
} from "../retryPolicy.js";

describe("journey action retry policy", () => {
  const policy: JourneyActionRetryPolicy = {
    maxAttempts: 5,
    delaysSeconds: [30, 120, 600, 1800],
  };

  it("returns the configured backoff delays", () => {
    expect(getRetryDelaySeconds(policy, 1)).toBe(30);
    expect(getRetryDelaySeconds(policy, 2)).toBe(120);
    expect(getRetryDelaySeconds(policy, 3)).toBe(600);
    expect(getRetryDelaySeconds(policy, 4)).toBe(1800);
  });

  it("returns null after max attempts", () => {
    expect(getRetryDelaySeconds(policy, 5)).toBeNull();
    expect(getRetryDelaySeconds(policy, 6)).toBeNull();
  });

  it("calculates retry time from the current time", () => {
    const now = new Date("2026-10-01T10:00:00.000Z");

    expect(getRetryAt(policy, 1, now)).toEqual(
      new Date("2026-10-01T10:00:30.000Z"),
    );

    expect(getRetryAt(policy, 2, now)).toEqual(
      new Date("2026-10-01T10:02:00.000Z"),
    );

    expect(getRetryAt(policy, 3, now)).toEqual(
      new Date("2026-10-01T10:10:00.000Z"),
    );

    expect(getRetryAt(policy, 4, now)).toEqual(
      new Date("2026-10-01T10:30:00.000Z"),
    );
  });

  it("returns no retry time after max attempts", () => {
    const now = new Date("2026-10-01T10:00:00.000Z");

    expect(getRetryAt(policy, 5, now)).toBeNull();
  });
});
