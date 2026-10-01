import crypto from "node:crypto";

export function verifyInstagramWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const prefix = "sha256=";

  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const receivedHex =
    signatureHeader.slice(prefix.length);

  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const received = Buffer.from(receivedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}
