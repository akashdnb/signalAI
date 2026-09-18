import { createHmac, timingSafeEqual } from "node:crypto";

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export interface MetaSignedRequestPayload {
  user_id: string;
  algorithm: string;
  issued_at?: number;
  [key: string]: unknown;
}

/**
 * Verifies and decodes Meta's `signed_request` format, used by the Data
 * Deletion Callback. Returns null if the signature doesn't match — callers
 * must treat that as a rejected request, not fall back to trusting the payload.
 */
export function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequestPayload | null {
  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) return null;

  const expectedSig = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();
  const providedSig = base64UrlDecode(encodedSig);

  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  const payload = JSON.parse(
    base64UrlDecode(encodedPayload).toString("utf8"),
  ) as MetaSignedRequestPayload;

  return payload;
}
