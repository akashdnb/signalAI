import { createPublicKey, randomBytes, timingSafeEqual, verify, createHmac } from "node:crypto";
import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { findOrCreateUserByGoogle, getUserSessionVersion } from "../db/users.js";
import { listTenantsForUser } from "../db/tenantMembers.js";
import { createTenantForUser } from "../db/tenants.js";
import { createSessionToken } from "../lib/session.js";
import { Sentry } from "../lib/sentry.js";

export const googleAuthRouter = Router();

const STATE_COOKIE = "signalai_google_oauth_state";
const HANDOFF_TTL_MS = 2 * 60 * 1000;
const handoffTokens = new Map<string, { expiresAt: number; payload: { tenantId: string; token: string; email: string; firstName: string | null; lastName: string | null; picture: string | null } }>();
const spentOAuthStates = new Map<string, number>();
function spendStateOnce(state: string): boolean {
  const now = Date.now();
  for (const [value, expiresAt] of spentOAuthStates) if (expiresAt <= now) spentOAuthStates.delete(value);
  if (spentOAuthStates.has(state)) return false;
  spentOAuthStates.set(state, now + STATE_TTL_MS);
  return true;
}
const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

interface GoogleJwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface GoogleJwks {
  keys: GoogleJwk[];
}

let jwksCache: { expiresAt: number; keys: GoogleJwk[] } | null = null;

interface GoogleIdToken {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  picture?: unknown;
}

interface GoogleIdentity {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
}

interface OAuthState {
  value: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function safeEqualString(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value.includes("\r") || value.includes("\n")) return "/";
  return value;
}

function signedState(secret: string, payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyState(secret: string, state: string): OAuthState | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqualString(expected, signature)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as OAuthState;
    if (typeof payload.value !== "string" || typeof payload.nonce !== "string" || typeof payload.returnTo !== "string" || typeof payload.createdAt !== "number") return null;
    if (Date.now() - payload.createdAt > STATE_TTL_MS || payload.createdAt > Date.now() + 30_000) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    try {
      output[key] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // Ignore malformed cookies; the state check will fail closed.
    }
  }
  return output;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const pieces = idToken.split(".");
  if (pieces.length !== 3) throw new Error("invalid_google_id_token");
  let header: { alg?: unknown; kid?: unknown };
  let payload: GoogleIdToken;
  try {
    header = JSON.parse(base64UrlDecode(pieces[0]!).toString("utf8")) as typeof header;
    payload = JSON.parse(base64UrlDecode(pieces[1]!).toString("utf8")) as GoogleIdToken;
  } catch {
    throw new Error("invalid_google_id_token");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("invalid_google_id_token");
  let keys = jwksCache?.expiresAt && jwksCache.expiresAt > Date.now() ? jwksCache.keys : null;
  if (!keys) {
    const response = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("google_jwks_unavailable");
    const jwks = await response.json() as GoogleJwks;
    keys = jwks.keys;
    jwksCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  }
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256"));
  if (!jwk) throw new Error("unknown_google_signing_key");

  const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
  const signature = base64UrlDecode(pieces[2]!);
  const signedContent = Buffer.from(`${pieces[0]}.${pieces[1]}`);
  if (!verify("RSA-SHA256", signedContent, key, signature)) throw new Error("invalid_google_id_token");

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!GOOGLE_ISSUERS.has(String(payload.iss)) || !audiences.includes(config.googleClientId)) throw new Error("invalid_google_id_token");
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) throw new Error("expired_google_id_token");
  if (typeof payload.iat !== "number" || payload.iat * 1000 > Date.now() + 30_000) throw new Error("invalid_google_id_token");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("invalid_google_id_token");
  if (typeof payload.email !== "string" || !payload.email.trim() || payload.email_verified !== true) throw new Error("google_email_not_verified");
  if (Array.isArray(payload.aud) && typeof config.googleClientId === "string" && payload.aud.length > 1) {
    const azp = (payload as GoogleIdToken & { azp?: unknown }).azp;
    if (azp !== config.googleClientId) throw new Error("invalid_google_id_token");
  }

  const picture = typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null;
  return {
    sub: payload.sub,
    email: payload.email,
    givenName: typeof payload.given_name === "string" ? payload.given_name : null,
    familyName: typeof payload.family_name === "string" ? payload.family_name : null,
    picture,
  };
}

function redirectAuthError(res: import("express").Response, reason: string) {
  return res.redirect(`${config.appBaseUrl}/login?auth_error=${encodeURIComponent(reason)}`);
}

googleAuthRouter.get("/auth/google/start", (req, res) => {
  if (!config.googleOauthReady) {
    return redirectAuthError(res, "google_not_configured");
  }

  const nonce = randomBytes(32).toString("base64url");
  const verifierState: OAuthState = {
    value: randomBytes(32).toString("base64url"),
    nonce,
    returnTo: safeReturnTo(req.query.returnTo),
    createdAt: Date.now(),
  };
  const state = signedState(config.sessionSecret, verifierState);
  res.cookie(STATE_COOKIE, verifierState.value, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_MS,
    path: "/auth/google",
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();
  return res.redirect(url.toString());
});

googleAuthRouter.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const oauthError = req.query.error;
  const rawStateCookie = parseCookies(req.header("cookie"))[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/auth/google" });

  if (oauthError) return redirectAuthError(res, "google_sign_in_cancelled");
  if (typeof code !== "string" || typeof state !== "string" || !rawStateCookie) return redirectAuthError(res, "invalid_google_state");
  const statePayload = verifyState(config.sessionSecret, state);
  if (!statePayload) return redirectAuthError(res, "invalid_google_state");
  if (!safeEqualString(statePayload.value, rawStateCookie) || !spendStateOnce(state)) return redirectAuthError(res, "invalid_google_state");
  if (!config.googleOauthReady) return redirectAuthError(res, "google_not_configured");

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenResponse.ok) return redirectAuthError(res, "google_token_exchange_failed");
    const tokens = await tokenResponse.json() as { id_token?: unknown };
    if (typeof tokens.id_token !== "string") return redirectAuthError(res, "invalid_google_id_token");
    const identity = await verifyGoogleIdToken(tokens.id_token);
    // Check the OIDC nonce claim against the nonce generated before redirect.
    const tokenPayload = JSON.parse(base64UrlDecode(tokens.id_token.split(".")[1]!).toString("utf8")) as { nonce?: unknown };
    if (tokenPayload.nonce !== statePayload.nonce) return redirectAuthError(res, "invalid_google_state");

    const pool = getPool();
    const user = await findOrCreateUserByGoogle(pool, identity);
    if (user.googleSubject !== identity.sub) return redirectAuthError(res, "google_identity_conflict");

    let tenants = await listTenantsForUser(pool, user.id);
    if (tenants.length === 0) {
      const name = [identity.givenName, identity.familyName].filter(Boolean).join(" ").trim() || "My workspace";
      const tenant = await createTenantForUser(pool, name, user.id);
      tenants = [{ tenantId: tenant.id, role: "owner" }];
    }
    const tenantId = tenants[0]!.tenantId;
    const sessionVersion = (await getUserSessionVersion(pool, user.id)) ?? 1;
    const token = createSessionToken(config.sessionSecret, user.id, sessionVersion);
    const handoff = randomBytes(32).toString("base64url");
    handoffTokens.set(handoff, {
      expiresAt: Date.now() + HANDOFF_TTL_MS,
      payload: {
        tenantId,
        token,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.profilePictureUrl,
      },
    });
    const destination = safeReturnTo(statePayload.returnTo);
    const redirect = new URL(destination, config.appBaseUrl);
    redirect.searchParams.set("google_auth", "success");
    redirect.searchParams.set("handoff", handoff);
    return res.redirect(redirect.toString());
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    Sentry.captureException(err);
    return redirectAuthError(res, "google_sign_in_failed");
  }
});


googleAuthRouter.post("/auth/google/exchange", (req, res) => {
  const handoff = req.body?.handoff;
  if (typeof handoff !== "string" || !handoff) return res.status(400).json({ error: "invalid_google_handoff" });
  const entry = handoffTokens.get(handoff);
  handoffTokens.delete(handoff);
  if (!entry || entry.expiresAt <= Date.now()) return res.status(401).json({ error: "expired_google_handoff" });
  return res.status(200).json(entry.payload);
});
