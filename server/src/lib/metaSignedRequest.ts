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

// R1-11: issued_at was parsed but never checked, so a captured deletion
// signed_request (referrer leak, logs, shared screen) could be replayed
// indefinitely with a valid signature. A day is generous for a deletion
// callback's normal delivery latency and still closes the indefinite window.
const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies and decodes Meta's `signed_request` format, used by the Data
 * Deletion Callback. Returns null if the signature doesn't match, the
 * payload isn't valid JSON, or it's stale — callers must treat every case
 * as a rejected request, not fall back to trusting the payload.
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

  let payload: MetaSignedRequestPayload;
  try {
    // R1-11: a valid signature over a malformed payload used to throw out
    // of the route instead of returning a clean rejection.
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as MetaSignedRequestPayload;
  } catch {
    return null;
  }

  if (typeof payload.issued_at === "number") {
    const ageSeconds = Date.now() / 1000 - payload.issued_at;
    if (ageSeconds > MAX_AGE_SECONDS || ageSeconds < 0) {
      return null;
    }
  }

  return payload;
}
