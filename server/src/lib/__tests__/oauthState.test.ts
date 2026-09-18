import { describe, expect, it, vi } from "vitest";
import { createOAuthState, nonceMatches, parseCookie, verifyOAuthState } from "../oauthState.js";

const SECRET = "state-secret";

describe("OAuth state (CSRF token)", () => {
  it("round-trips the tenantId it was created for", () => {
    const { state } = createOAuthState(SECRET, "tenant-123");
    const payload = verifyOAuthState(SECRET, state);
    expect(payload?.tenantId).toBe("tenant-123");
  });

  it("returns a nonce that matches the one embedded in the state", () => {
    const { state, nonce } = createOAuthState(SECRET, "tenant-123");
    const payload = verifyOAuthState(SECRET, state);
    expect(payload?.nonce).toBe(nonce);
  });

  it("rejects a state signed with a different secret", () => {
    const { state } = createOAuthState("other-secret", "tenant-123");
    expect(verifyOAuthState(SECRET, state)).toBeNull();
  });

  it("rejects a tampered payload even if the signature format still parses", () => {
    const { state } = createOAuthState(SECRET, "tenant-123");
    const [payload, signature] = state.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(verifyOAuthState(SECRET, tampered)).toBeNull();
  });

  it("rejects a malformed state", () => {
    expect(verifyOAuthState(SECRET, "not-a-real-state")).toBeNull();
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    const { state } = createOAuthState(SECRET, "tenant-123");
    vi.advanceTimersByTime(11 * 60 * 1000); // past the 10-minute window
    expect(verifyOAuthState(SECRET, state)).toBeNull();
    vi.useRealTimers();
  });
});

describe("nonceMatches", () => {
  it("matches identical nonces", () => {
    expect(nonceMatches("abc123", "abc123")).toBe(true);
  });

  it("does not match different nonces", () => {
    expect(nonceMatches("abc123", "def456")).toBe(false);
  });
});

describe("parseCookie", () => {
  it("extracts a named cookie from a header with multiple cookies", () => {
    expect(parseCookie("a=1; ig_oauth_nonce=abc123; b=2", "ig_oauth_nonce")).toBe("abc123");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(parseCookie("a=1; b=2", "ig_oauth_nonce")).toBeUndefined();
  });

  it("returns undefined for an undefined header", () => {
    expect(parseCookie(undefined, "ig_oauth_nonce")).toBeUndefined();
  });
});
