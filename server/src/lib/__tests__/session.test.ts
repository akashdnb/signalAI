import { describe, expect, it, vi } from "vitest";
import { assertSessionSecretConfigured, createSessionToken, verifySessionToken } from "../session.js";

const SECRET = "test-session-secret";

describe("session tokens (R10-01)", () => {
  it("round-trips a userId and sessionVersion through a created token", () => {
    const token = createSessionToken(SECRET, "user-1", 3);
    const payload = verifySessionToken(SECRET, token);
    expect(payload?.userId).toBe("user-1");
    expect(payload?.sessionVersion).toBe(3);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("other-secret", "user-1", 1);
    expect(verifySessionToken(SECRET, token)).toBeNull();
  });

  it("rejects a tampered payload even if the signature format looks right", () => {
    const token = createSessionToken(SECRET, "user-1", 1);
    const [, signature] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ userId: "victim-user", issuedAt: Date.now(), sessionVersion: 1 })).toString("base64url")}.${signature}`;
    expect(verifySessionToken(SECRET, tampered)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifySessionToken(SECRET, "not-a-real-token")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const token = createSessionToken(SECRET, "user-1", 1);
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(SECRET, token)).toBeNull();
    vi.useRealTimers();
  });
});

describe("assertSessionSecretConfigured (R10-01)", () => {
  it("throws on an empty secret — a forgeable session is a boot-time error, not a runtime one", () => {
    expect(() => assertSessionSecretConfigured("")).toThrow();
  });

  it("does not throw on a real secret", () => {
    expect(() => assertSessionSecretConfigured(SECRET)).not.toThrow();
  });
});
