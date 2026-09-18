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
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
