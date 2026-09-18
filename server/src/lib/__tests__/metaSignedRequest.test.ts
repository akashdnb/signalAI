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
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
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
});
