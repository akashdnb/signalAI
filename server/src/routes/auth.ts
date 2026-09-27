import { Router, type Response } from "express";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { upsertToken } from "../db/tokens.js";
import { registerInstagramTrialUse } from "../db/instagramTrialHistory.js";
import { endTrialImmediately } from "../db/tenants.js";
import { trySpendNonce } from "../db/oauthNonces.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { OAUTH_NONCE_COOKIE, createOAuthState, nonceMatches, parseCookie, verifyOAuthState } from "../lib/oauthState.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "../lib/instagramOAuth.js";
import { Sentry } from "../lib/sentry.js";

export const authRouter = Router();

/**
 * Identity Refactor U4/U6: connecting Instagram is now an action inside the
 * dashboard, gated by a real session — but `/start` itself is reached via
 * a top-level browser navigation (`window.location.href`, so Instagram's
 * own redirect can eventually land back on `/callback`), and a navigation
 * cannot carry an `Authorization` header. This route is hit via a JSON
 * fetch (which CAN carry one) from BUI, authenticated the normal way via
 * `requireTenantSession`, and mints a short-lived, tenantId-bound
 * "connect token" for `/start` to redeem — reusing `createOAuthState`
 * as-is, since its shape (`{tenantId, nonce, issuedAt}`, signed, 10-minute
 * expiry) is exactly a "prove an authenticated, membership-checked
 * request minted this recently" token, whatever it's used for. Its own
 * `nonce` is not the OAuth CSRF nonce below — that's a second, distinct
 * token, minted only after this one verifies.
 */
authRouter.post("/tenants/:tenantId/instagram/connect-link", requireTenantSession, (req, res) => {
  const { tenantId } = req.params;
  const { state: connectToken } = createOAuthState(config.metaAppSecret, tenantId!);
  const url = `${config.apiBaseUrl}/auth/instagram/start?tenantId=${tenantId}&connectToken=${encodeURIComponent(connectToken)}`;
  return res.status(200).json({ url });
});

authRouter.get("/auth/instagram/start", async (req, res) => {
  const tenantId = req.query.tenantId;
  const connectToken = req.query.connectToken;
  if (typeof tenantId !== "string" || !tenantId) {
    return res.status(400).json({ error: "tenantId is required" });
  }
  if (typeof connectToken !== "string" || !connectToken) {
    return res.status(400).json({ error: "connectToken is required" });
  }

  const connectPayload = verifyOAuthState(config.metaAppSecret, connectToken);
  if (!connectPayload || connectPayload.tenantId !== tenantId) {
    return res.status(401).json({ error: "invalid or expired connect link — please try connecting again" });
  }

  // R15-01 fix: verifyOAuthState only checks signature + expiry, not
  // single-use — a captured connect URL (referrer leak, shared screen)
  // was replayable for its whole 10-minute window, letting an attacker
  // mint their own OAuth state/nonce off it, authorize with their own
  // Instagram account, and attach it to the victim's tenant. The connect
  // token already carries a nonce (from createOAuthState above); spending
  // it here — in the same spent_oauth_nonces table the OAuth CSRF nonce
  // below uses — makes the connect link single-use the same way.
  if (!(await trySpendNonce(getPool(), connectPayload.nonce))) {
    return res.status(401).json({ error: "invalid or expired connect link — please try connecting again" });
  }

  const { state, nonce } = createOAuthState(config.metaAppSecret, tenantId);

  // R1-02: binds the state to this browser and makes it single-use — a
  // captured `state` string alone (referrer leak, shared screen, browser
  // history) is not enough to complete the flow without this cookie too.
  res.cookie(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    // Secure requires HTTPS, which is correct in production (Render
    // terminates TLS there) but breaks local HTTP dev/test entirely — the
    // cookie is simply never sent back, which is exactly the failure this
    // test suite caught before this was made conditional.
    secure: isProduction(),
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    // R4-04: without this it defaults to "/" and rides along on every
    // request to the domain (webhook posts, asset loads) — it's only ever
    // needed on this one flow.
    path: "/auth/instagram",
  });

  const url = buildAuthorizationUrl(
    {
      clientId: config.instagramClientId,
      clientSecret: config.metaAppSecret,
      redirectUri: config.instagramRedirectUri,
    },
    state,
  );

  return res.redirect(url);
});

/**
 * BUI: a real browser lands on this URL via a top-level navigation
 * (Instagram's own redirect), not a fetch from the SPA — so every outcome
 * here redirects back into the app rather than returning raw JSON, which
 * would otherwise leave the creator staring at a blank API response after
 * connecting. `/connect` is the retry screen (with a short `error` code
 * that doesn't leak internals).
 */
function redirectToConnectError(res: Response, error: string) {
  return res.redirect(`${config.appBaseUrl}/connect?error=${encodeURIComponent(error)}`);
}

authRouter.get("/auth/instagram/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (typeof code !== "string" || typeof state !== "string") {
    return redirectToConnectError(res, "missing_params");
  }

  const statePayload = verifyOAuthState(config.metaAppSecret, state);
  if (!statePayload) {
    return redirectToConnectError(res, "invalid_state");
  }

  // R1-02: the state's signature alone isn't enough — it must also match
  // the nonce this browser was given at authorize time. Clear the cookie
  // either way once checked, so a replay (same browser, same state) fails
  // even inside the state's own 10-minute validity window.
  const cookieNonce = parseCookie(req.header("cookie"), OAUTH_NONCE_COOKIE);
  res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/auth/instagram" }); // must match the path it was set with (R4-04)
  if (!cookieNonce || !nonceMatches(cookieNonce, statePayload.nonce)) {
    return redirectToConnectError(res, "session_mismatch");
  }

  // R4-02: the cookie clear above is a client-side courtesy — it asks the
  // browser to drop the cookie, but the server itself kept no record, so
  // the identical (state, cookie) pair was still accepted from anyone
  // holding both, any number of times, inside the state's validity window.
  // This is the actual single-use enforcement.
  if (!(await trySpendNonce(getPool(), statePayload.nonce))) {
    return redirectToConnectError(res, "already_used");
  }

  try {
    const oauthConfig = {
      clientId: config.instagramClientId,
      clientSecret: config.metaAppSecret,
      redirectUri: config.instagramRedirectUri,
    };

    const shortLived = await exchangeCodeForShortLivedToken(oauthConfig, code);
    const longLived = await exchangeForLongLivedToken(oauthConfig.clientSecret, shortLived.access_token);
    const profile = await fetchInstagramProfile(longLived.access_token);

    const pool = getPool();
    const tenantId = statePayload.tenantId;

    // Identity Refactor U5 fix: the resolve-by-profile.id heuristic (R5-01)
    // only existed because `/start` used to mint tenants blindly, making
    // "which tenant does this account really belong to" ambiguous after
    // the fact. Now the tenant is known and authenticated up front (U4),
    // so an account already attached elsewhere is a real conflict, not
    // something to silently re-parent around.
    const existingTenantId = await findTenantByInstagramAccountId(pool, profile.id);
    if (existingTenantId && existingTenantId !== tenantId) {
      return redirectToConnectError(res, "account_already_connected");
    }

    await upsertToken(pool, config.tokenKeyring, {
      tenantId,
      instagramAccountId: profile.id,
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
    });

    // Phase 2B Trial-Abuse Guardrail: trial eligibility is tied to this
    // Instagram account, not the email/signup that created the tenant.
    // isFirstUse is true the very first time this account has ever
    // connected, to any tenant — this tenant's trial stands. A false
    // means the account already has trial history under a DIFFERENT
    // tenant (firstTenantId !== tenantId); the same tenant reconnecting
    // its own already-registered account is also `isFirstUse: false` but
    // isn't abuse, so only the cross-tenant case ends the trial early.
    const trialUse = await registerInstagramTrialUse(pool, profile.id, tenantId);
    if (!trialUse.isFirstUse && trialUse.firstTenantId !== tenantId) {
      await endTrialImmediately(pool, tenantId);
    }

    // No session is issued here anymore — the caller was already logged
    // in before starting this flow (U4), and that session stays valid
    // throughout. This redirect just returns them to their dashboard.
    return res.redirect(`${config.appBaseUrl}/dashboard/${tenantId}?connected=1`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Instagram OAuth callback failed:", err);
    Sentry.captureException(err);
    return redirectToConnectError(res, "connection_failed");
  }
});
