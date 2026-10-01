import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInstagramWebhookSignature } from "../signature.js";

describe("verifyInstagramWebhookSignature", () => {
  const secret = "test-app-secret";
  const body = Buffer.from(
    JSON.stringify({
      object: "instagram",
      entry: [{ id: "instagram-account-1" }],
    }),
  );

  function signatureFor(payload: Buffer) {
    return `sha256=${createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;
  }

  it("accepts a valid Meta signature", () => {
    expect(
      verifyInstagramWebhookSignature(
        body,
        signatureFor(body),
        secret,
      ),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(
      verifyInstagramWebhookSignature(
        body,
        "sha256=invalid",
        secret,
      ),
    ).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(
      verifyInstagramWebhookSignature(
        body,
        undefined,
        secret,
      ),
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    expect(
      verifyInstagramWebhookSignature(
        body,
        "invalid-signature",
        secret,
      ),
    ).toBe(false);
  });

  it("uses the raw request body for verification", () => {
    const rawBody = Buffer.from('{"foo":"bar"}');
    const prettyBody = Buffer.from(
      JSON.stringify(JSON.parse(rawBody.toString()), null, 2),
    );

    const signature = signatureFor(rawBody);

    expect(
      verifyInstagramWebhookSignature(
        rawBody,
        signature,
        secret,
      ),
    ).toBe(true);

    expect(
      verifyInstagramWebhookSignature(
        prettyBody,
        signature,
        secret,
      ),
    ).toBe(false);
  });
});
