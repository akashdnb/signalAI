import { describe, expect, it, vi } from "vitest";
import { createOAuthState, verifyOAuthState } from "../oauthState.js";

const SECRET = "state-secret";

describe("OAuth state (CSRF token)", () => {
  it("round-trips the tenantId it was created for", () => {
    const state = createOAuthState(SECRET, "tenant-123");
    const payload = verifyOAuthState(SECRET, state);
    expect(payload?.tenantId).toBe("tenant-123");
  });

  it("rejects a state signed with a different secret", () => {
    const state = createOAuthState("other-secret", "tenant-123");
    expect(verifyOAuthState(SECRET, state)).toBeNull();
  });

  it("rejects a tampered payload even if the signature format still parses", () => {
    const state = createOAuthState(SECRET, "tenant-123");
    const [payload, signature] = state.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(verifyOAuthState(SECRET, tampered)).toBeNull();
  });

  it("rejects a malformed state", () => {
    expect(verifyOAuthState(SECRET, "not-a-real-state")).toBeNull();
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    const state = createOAuthState(SECRET, "tenant-123");
    vi.advanceTimersByTime(11 * 60 * 1000); // past the 10-minute window
    expect(verifyOAuthState(SECRET, state)).toBeNull();
    vi.useRealTimers();
  });
});
