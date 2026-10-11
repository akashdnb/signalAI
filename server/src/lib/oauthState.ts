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
  /** Provider account id when this flow is an explicit reconnect. */
  instagramAccountId?: string;
}

const MAX_AGE_MS = 10 * 60 * 1000;

export const OAUTH_NONCE_COOKIE = "ig_oauth_nonce";

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function createOAuthState(
  secret: string,
  tenantId: string,
  instagramAccountId?: string,
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload: OAuthState = {
    tenantId,
    nonce,
    issuedAt: Date.now(),
    ...(instagramAccountId ? { instagramAccountId } : {}),
  };
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest();
  return { state: `${encodedPayload}.${base64UrlEncode(signature)}`, nonce };
}

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

export const parseCookie = (cookieHeader: string | undefined, name: string): string | undefined => {
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
};

export function nonceMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
