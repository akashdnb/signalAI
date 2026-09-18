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

/**
 * R1-02 fix: the signed `state` alone is not bound to a browser session and
 * isn't single-use, which allows account-attachment CSRF — an attacker who
 * captures a victim's state (referrer leak, shared screen, browser history)
 * could complete the flow themselves and attach their own Instagram account
 * to the victim's tenant, or the reverse (get a victim to complete a flow
 * carrying the attacker's state, attaching the victim's account to the
 * attacker's tenant). This cookie name is where the state's own `nonce` is
 * additionally stored, HttpOnly/Secure/SameSite=Lax, at authorize time; the
 * callback must see the SAME nonce in both places before proceeding, and
 * clears the cookie once used so a replay in the same browser fails too.
 */
export const OAUTH_NONCE_COOKIE = "ig_oauth_nonce";

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function createOAuthState(secret: string, tenantId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload: OAuthState = { tenantId, nonce, issuedAt: Date.now() };
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest();
  return { state: `${encodedPayload}.${base64UrlEncode(signature)}`, nonce };
}

/** Returns null on a bad signature, malformed payload, or an expired state — callers must reject all as invalid. */
export function verifyOAuthState(secret: string, state: string): OAuthState | null {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  const provided = base64UrlDecode(encodedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: OAuthState;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
  if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;

  return payload;
}

/**
 * Minimal cookie-header parser — avoids pulling in `cookie-parser` for the
 * one cookie this flow needs. R4-03 fix: the header comes straight from an
 * attacker-controllable `Cookie` header, and `decodeURIComponent` throws on
 * malformed percent-encoding (`%zz`) — a crafted request used to 500 the
 * callback instead of being rejected cleanly as "no cookie."
 */
export function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Constant-time comparison for the nonce match — it's not secret, but there's no reason to compare it any other way. */
export function nonceMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
