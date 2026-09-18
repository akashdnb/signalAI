import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs webhook payloads with `X-Hub-Signature-256: sha256=<hex>`,
 * HMAC-SHA256 over the RAW request body (not the parsed/re-serialized
 * JSON — whitespace differences would break the signature). The endpoint
 * is public; this is the only thing standing between an attacker and the
 * source-of-truth event log.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const providedHex = signatureHeader.slice("sha256=".length);
  // R1-14: Buffer.from(x, "hex") never throws on invalid input — it just
  // truncates at the first bad pair — so a try/catch around it was dead
  // code implying a guard that didn't exist. An explicit format check is
  // the real one; the length comparison below still exists as well, but
  // shouldn't be the only thing standing between "malformed" and "safe".
  if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length % 2 !== 0) {
    return false;
  }

  const provided = Buffer.from(providedHex, "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
