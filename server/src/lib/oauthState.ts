import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A signed, expiring `state` value for the OAuth CSRF check — carries which
 * tenant is connecting through the redirect round-trip without needing
 * server-side session storage.
 */
export interface OAuthState {
  tenantId: string;
  nonce: string;
  issuedAt: number;
}

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real login flow

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function createOAuthState(secret: string, tenantId: string): string {
  const payload: OAuthState = { tenantId, nonce: randomBytes(16).toString("hex"), issuedAt: Date.now() };
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

/** Returns null on a bad signature or an expired state — callers must reject both as invalid. */
export function verifyOAuthState(secret: string, state: string): OAuthState | null {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  const provided = base64UrlDecode(encodedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as OAuthState;
  if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;

  return payload;
}
