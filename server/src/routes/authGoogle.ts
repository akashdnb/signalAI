import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Router, type Response } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { findOrCreateUserByGoogle, getUserSessionVersion } from "../db/users.js";
import { listTenantsForUser } from "../db/tenantMembers.js";
import { createTenantForUser } from "../db/tenants.js";
import { createSessionToken } from "../lib/session.js";
import { Sentry } from "../lib/sentry.js";

export const googleAuthRouter = Router();
const STATE_COOKIE = "signalai_google_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

interface OAuthState {
  cookieValue: string;
  nonce: string;
  createdAt: number;
}
interface GoogleIdentity {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
}

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function safeEqualString(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
function signState(secret: string, payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}
function decodeStateBody(body: string): OAuthState | null {
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (typeof payload.cookieValue !== "string" || typeof payload.nonce !== "string" || typeof payload.createdAt !== "number") return null;
    if (Date.now() - payload.createdAt > STATE_TTL_MS || payload.createdAt > Date.now() + 30_000) return null;
    return payload;
  } catch {
    return null;
  }
}
function verifyState(secret: string, state: string): OAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!safeEqualString(expected, parts[1])) return null;
  return decodeStateBody(parts[0]);
}
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    try { cookies[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* fail closed below */ }
  }
  return cookies;
}
function redirectAuthError(res: Response, reason: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.redirect(`${config.appBaseUrl}/login?auth_error=${encodeURIComponent(reason)}`);
}

async function verifyGoogleIdToken(idToken: string, expectedNonce: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: config.googleClientId,
    clockTolerance: 30,
    maxTokenAge: "10m",
  });
  if (payload.nonce !== expectedNonce) throw new Error("invalid_google_nonce");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("invalid_google_sub");
  if (typeof payload.email !== "string" || !payload.email.trim() || payload.email_verified !== true) {
    throw new Error("google_email_not_verified");
  }
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.googleClientId) {
    throw new Error("invalid_google_authorized_party");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    givenName: typeof payload.given_name === "string" ? payload.given_name : null,
    familyName: typeof payload.family_name === "string" ? payload.family_name : null,
    picture: typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null,
  };
}

async function spendOAuthState(state: string, cookieValue: string): Promise<boolean> {
  const result = await getPool().query(
    `update google_oauth_states
     set used_at = now()
     where state_hash = $1 and cookie_hash = $2 and used_at is null and expires_at > now()
     returning id`,
    [hashOpaqueToken(state), hashOpaqueToken(cookieValue)],
  );
  return (result.rowCount ?? 0) === 1;
}
async function storeHandoff(payload: {
  tenantId: string; token: string; email: string;
  firstName: string | null; lastName: string | null; picture: string | null;
}): Promise<string> {
  const handoff = randomBytes(32).toString("base64url");
  await getPool().query(
    `insert into google_login_handoffs (token_hash, payload, expires_at)
     values ($1, $2::jsonb, now() + interval '2 minutes')`,
    [hashOpaqueToken(handoff), JSON.stringify(payload)],
  );
  return handoff;
}

googleAuthRouter.get("/auth/google/start", async (req, res) => {
  if (!config.googleOauthReady) return redirectAuthError(res, "google_not_configured");
  try {
    const cookieValue = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const statePayload: OAuthState = { cookieValue, nonce, createdAt: Date.now() };
    const state = signState(config.sessionSecret, statePayload);
    await getPool().query(
      `insert into google_oauth_states (state_hash, cookie_hash, expires_at)
       values ($1, $2, $3)`,
      [hashOpaqueToken(state), hashOpaqueToken(cookieValue), new Date(Date.now() + STATE_TTL_MS)],
    );
    res.cookie(STATE_COOKIE, cookieValue, {
      httpOnly: true, secure: config.nodeEnv === "production", sameSite: "lax",
      maxAge: STATE_TTL_MS, path: "/auth/google",
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: config.googleClientId, redirect_uri: config.googleRedirectUri,
      response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account",
    }).toString();
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(url.toString());
  } catch (error) {
    console.error("Unable to start Google OAuth:", error);
    Sentry.captureException(error);
    return redirectAuthError(res, "google_sign_in_failed");
  }
});

googleAuthRouter.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const oauthError = req.query.error;
  const cookieValue = parseCookies(req.header("cookie"))[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/auth/google" });
  if (oauthError) return redirectAuthError(res, "google_sign_in_cancelled");
  if (typeof code !== "string" || typeof state !== "string" || !cookieValue) return redirectAuthError(res, "invalid_google_state");
  const statePayload = verifyState(config.sessionSecret, state);
  if (!statePayload || !safeEqualString(statePayload.cookieValue, cookieValue)) return redirectAuthError(res, "invalid_google_state");
  if (!config.googleOauthReady) return redirectAuthError(res, "google_not_configured");
  try {
    if (!(await spendOAuthState(state, cookieValue))) return redirectAuthError(res, "invalid_google_state");
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: config.googleClientId, client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri, grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return redirectAuthError(res, "google_token_exchange_failed");
    const tokenResult = await response.json() as { id_token?: unknown };
    if (typeof tokenResult.id_token !== "string") return redirectAuthError(res, "invalid_google_id_token");
    const identity = await verifyGoogleIdToken(tokenResult.id_token, statePayload.nonce);
    const user = await findOrCreateUserByGoogle(getPool(), identity);
    if (user.googleSubject !== identity.sub) return redirectAuthError(res, "google_identity_conflict");
    let tenants = await listTenantsForUser(getPool(), user.id);
    if (tenants.length === 0) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "My workspace";
      const tenant = await createTenantForUser(getPool(), name, user.id);
      tenants = [{ tenantId: tenant.id, role: "owner" }];
    }
    const tenantId = tenants[0]!.tenantId;
    const version = (await getUserSessionVersion(getPool(), user.id)) ?? 1;
    const token = createSessionToken(config.sessionSecret, user.id, version);
    const handoff = await storeHandoff({
      tenantId, token, email: user.email, firstName: user.firstName,
      lastName: user.lastName, picture: user.profilePictureUrl,
    });
    const redirect = new URL("/login", config.appBaseUrl);
    redirect.searchParams.set("google_auth", "success");
    redirect.searchParams.set("handoff", handoff);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(redirect.toString());
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    Sentry.captureException(error);
    return redirectAuthError(res, "google_sign_in_failed");
  }
});

googleAuthRouter.post("/auth/google/exchange", async (req, res) => {
  const handoff = req.body?.handoff;
  if (typeof handoff !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(handoff)) {
    return res.status(400).json({ error: "invalid_google_handoff" });
  }
  try {
    const result = await getPool().query<{ payload: unknown }>(
      `update google_login_handoffs
       set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
       returning payload`,
      [hashOpaqueToken(handoff)],
    );
    const payload = result.rows[0]?.payload;
    if (!payload) return res.status(401).json({ error: "expired_google_handoff" });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Google handoff exchange failed:", error);
    Sentry.captureException(error);
    return res.status(500).json({ error: "google_handoff_failed" });
  }
});
