import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignedRequest } from "../metaSignedRequest.js";

const APP_SECRET = "test-secret";

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: object, secret = APP_SECRET): string {
  return signRaw(JSON.stringify(payload), secret);
}

function signRaw(rawPayload: string, secret = APP_SECRET): string {
  const encodedPayload = base64UrlEncode(rawPayload);
  const sig = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${base64UrlEncode(sig)}.${encodedPayload}`;
}

describe("verifySignedRequest", () => {
  it("decodes a validly signed payload", () => {
    const signedRequest = sign({ user_id: "abc123", algorithm: "HMAC-SHA256" });
    const result = verifySignedRequest(signedRequest, APP_SECRET);
    expect(result?.user_id).toBe("abc123");
  });

  it("rejects a payload signed with a different secret", () => {
    const signedRequest = sign({ user_id: "abc123", algorithm: "HMAC-SHA256" }, "wrong-secret");
    const result = verifySignedRequest(signedRequest, APP_SECRET);
    expect(result).toBeNull();
  });

  it("rejects a malformed signed_request", () => {
    expect(verifySignedRequest("not-a-valid-token", APP_SECRET)).toBeNull();
  });

  it("accepts a payload with a fresh issued_at", () => {
    const signedRequest = sign({
      user_id: "abc123",
      algorithm: "HMAC-SHA256",
      issued_at: Math.floor(Date.now() / 1000),
    });
    expect(verifySignedRequest(signedRequest, APP_SECRET)?.user_id).toBe("abc123");
  });

  // R1-11 regression: issued_at used to be parsed but never checked,
  // allowing a captured signed_request to be replayed indefinitely.
  it("rejects a stale payload (replay protection)", () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const signedRequest = sign({ user_id: "abc123", algorithm: "HMAC-SHA256", issued_at: twoDaysAgo });
    expect(verifySignedRequest(signedRequest, APP_SECRET)).toBeNull();
  });

  it("rejects a payload claiming to be issued in the future", () => {
    const inTheFuture = Math.floor(Date.now() / 1000) + 60 * 60;
    const signedRequest = sign({ user_id: "abc123", algorithm: "HMAC-SHA256", issued_at: inTheFuture });
    expect(verifySignedRequest(signedRequest, APP_SECRET)).toBeNull();
  });

  it("rejects a validly-signed payload that isn't valid JSON, without throwing", () => {
    const signedRequest = signRaw("not valid json{{{");
    expect(() => verifySignedRequest(signedRequest, APP_SECRET)).not.toThrow();
    expect(verifySignedRequest(signedRequest, APP_SECRET)).toBeNull();
  });
});
