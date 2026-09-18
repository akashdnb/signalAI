import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../webhookSignature.js";

const APP_SECRET = "test-app-secret";

function sign(body: Buffer, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    expect(verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"), APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body whose signature no longer matches", () => {
    const original = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign(original, APP_SECRET);
    const tampered = Buffer.from(JSON.stringify({ hello: "attacker" }));
    expect(verifyWebhookSignature(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = Buffer.from("{}");
    expect(verifyWebhookSignature(body, undefined, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed header without the sha256= prefix", () => {
    const body = Buffer.from("{}");
    expect(verifyWebhookSignature(body, "not-a-real-signature", APP_SECRET)).toBe(false);
  });
});
