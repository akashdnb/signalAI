import { Router, type Response } from "express";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { createTenant, getTenantSessionVersion } from "../db/tenants.js";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { upsertToken } from "../db/tokens.js";
import { trySpendNonce } from "../db/oauthNonces.js";
import { OAUTH_NONCE_COOKIE, createOAuthState, nonceMatches, parseCookie, verifyOAuthState } from "../lib/oauthState.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "../lib/instagramOAuth.js";
import { Sentry } from "../lib/sentry.js";
import { createSessionToken } from "../lib/session.js";

export const authRouter = Router();

// Starts the connect flow. Phase 1 has no separate signup step —
// connecting Instagram *is* the signup — so this always mints a fresh
// tenant. R4-01 fix: an earlier version also accepted an existing
// `tenantId` from the query string to support reconnection, but nothing
// authenticated the caller as that tenant's owner — the R1-02 cookie
// binding proves "the same browser started and finished the flow," not
// "this browser is entitled to that tenant." Anyone who learned a tenant
// UUID (a URL, a support thread, a screenshot) could attach their own
// Instagram account to someone else's tenant. Dropped entirely rather
// than gated, since Phase 1 has no session system to gate it with —
// reconnection-after-failure is an operator task until real auth exists.
authRouter.get("/auth/instagram/start", async (req, res) => {
  const pool = getPool();
  const tenantName = req.query.tenantName;

  if (typeof tenantName !== "string" || tenantName.length === 0) {
    return res.status(400).json({ error: "tenantName is required" });
  }
  const tenant = await createTenant(pool, tenantName);
  const tenantId = tenant.id;

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
 * that doesn't leak internals); `/connected` is the success screen.
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

    // R5-01 fix: `/start` always mints a fresh tenant (see the comment
    // there), which is correct for a genuinely new connection but wrong
    // for a reconnect — using statePayload.tenantId unconditionally would
    // silently split one creator across two tenants every time they
    // reconnect (expired token, failed refresh, clicking "connect" again).
    // `profile.id` comes from the OAuth exchange itself, not from anything
    // the caller supplied, so it's the attacker-uncontrollable identifier
    // that actually determines which tenant this account belongs to: if
    // it's already connected somewhere, reuse that tenant and let the
    // fresh one from `/start` go unused, rather than creating a second
    // home for the same account. meta_tokens' global unique index on
    // instagram_account_id (migration 1758240000016) backs this up at the
    // data layer too.
    const existingTenantId = await findTenantByInstagramAccountId(pool, profile.id);
    const tenantId = existingTenantId ?? statePayload.tenantId;

    await upsertToken(pool, config.tokenKeyring, {
      tenantId,
      instagramAccountId: profile.id,
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
    });

    // R10-01: this is the one moment BUI has proven it's talking to the
    // real Instagram-connected browser for this tenant — issue the bearer
    // session here. Carried in the URL FRAGMENT, not a query param: a
    // fragment is never sent in the Referer header or to the server on
    // the next request, unlike a query string, so it doesn't ride along
    // on the app's own asset requests or leak to anything the /connected
    // page might link out to. BUI (ConnectedPage) reads it once and
    // immediately strips it from the visible URL/history via
    // navigate(..., {replace: true}) — the fragment must never persist as
    // its own history entry (R11-01).
    //
    // R11-02: reads the tenant's CURRENT session_version rather than
    // assuming 1 — if it had been bumped (a prior revocation), a stale
    // freshly-minted token would otherwise be issued that a bump was
    // specifically meant to invalidate.
    const sessionVersion = (await getTenantSessionVersion(pool, tenantId)) ?? 1;
    const sessionToken = createSessionToken(config.sessionSecret, tenantId, sessionVersion);
    return res.redirect(`${config.appBaseUrl}/connected?tenantId=${tenantId}#token=${sessionToken}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Instagram OAuth callback failed:", err);
    Sentry.captureException(err);
    return redirectToConnectError(res, "connection_failed");
  }
});
