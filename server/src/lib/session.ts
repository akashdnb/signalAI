import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Identity Refactor U3: a session identifies a PERSON (`userId`), not a
 * tenant. `tenantId` no longer lives in the token at all — membership is
 * checked separately, against `tenant_members`, on every request (see
 * lib/tenantAuth.ts). This is what makes "a session for a tenant you are
 * not a member of" a meaningful, checkable case, and what lets one person
 * eventually belong to more than one workspace (Phase 6) without the
 * token itself changing shape again.
 *
 * A bearer token (`Authorization: Bearer <token>`), not a cookie: BUI runs
 * on a different origin than the API, and a cross-origin cookie would need
 * `SameSite=None; Secure` plus `Access-Control-Allow-Credentials` — real
 * CSRF/CORS surface for a project with no other session infrastructure
 * yet. A bearer header sidesteps all of that and is the standard shape for
 * an SPA talking to an API on another origin.
 */
export interface SessionPayload {
  userId: string;
  issuedAt: number;
  /** Checked against users.session_version in requireTenantSession — bumping that column revokes every token issued before the bump, for one person, without rotating SESSION_SECRET (which would sign out everyone). */
  sessionVersion: number;
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
    throw new Error("No SESSION_SECRET configured — cannot issue or verify sessions");
  }
}

export function createSessionToken(secret: string, userId: string, sessionVersion: number): string {
  const payload: SessionPayload = { userId, issuedAt: Date.now(), sessionVersion };
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
