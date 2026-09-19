import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * R10-01 fix: every dashboard/campaigns/billing route was keyed on nothing
 * but a `:tenantId` UUID in the path — a de facto bearer token that the
 * system was actively distributing (Telegram alert links, browser URLs,
 * Stripe redirect URLs). This is the minimal signed-session mechanism the
 * finding asked for: issued once, at the end of a successful Instagram
 * connection (see routes/auth.ts), and checked against `:tenantId` on
 * every route that reads or writes tenant data.
 *
 * A bearer token (`Authorization: Bearer <token>`), not a cookie: BUI runs
 * on a different origin than the API, and a cross-origin cookie would need
 * `SameSite=None; Secure` plus `Access-Control-Allow-Credentials` — real
 * CSRF/CORS surface for a Phase 1 that has no other session infrastructure
 * yet. A bearer header sidesteps all of that and is the standard shape for
 * an SPA talking to an API on another origin.
 */
export interface SessionPayload {
  tenantId: string;
  issuedAt: number;
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a login session, not a CSRF token; long-lived on purpose

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** An empty secret would make every session forgeable (HMAC with an empty key) — same "fail at boot, not at first use" treatment as the token keyring. */
export function assertSessionSecretConfigured(secret: string): void {
  if (!secret) {
    throw new Error("No SESSION_SECRET configured — cannot issue or verify tenant sessions");
  }
}

export function createSessionToken(secret: string, tenantId: string): string {
  const payload: SessionPayload = { tenantId, issuedAt: Date.now() };
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

/** Returns null on a bad signature, malformed payload, or an expired token — callers must reject all as invalid. */
export function verifySessionToken(secret: string, token: string): SessionPayload | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  const provided = base64UrlDecode(encodedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (Date.now() - payload.issuedAt > SESSION_MAX_AGE_MS) return null;

  return payload;
}
