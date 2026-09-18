import { Router } from "express";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { createTenant } from "../db/tenants.js";
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

authRouter.get("/auth/instagram/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "missing code or state" });
  }

  const statePayload = verifyOAuthState(config.metaAppSecret, state);
  if (!statePayload) {
    return res.status(403).json({ error: "invalid or expired state" });
  }

  // R1-02: the state's signature alone isn't enough — it must also match
  // the nonce this browser was given at authorize time. Clear the cookie
  // either way once checked, so a replay (same browser, same state) fails
  // even inside the state's own 10-minute validity window.
  const cookieNonce = parseCookie(req.header("cookie"), OAUTH_NONCE_COOKIE);
  res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/auth/instagram" }); // must match the path it was set with (R4-04)
  if (!cookieNonce || !nonceMatches(cookieNonce, statePayload.nonce)) {
    return res.status(403).json({ error: "missing or mismatched oauth session — please restart the connection" });
  }

  // R4-02: the cookie clear above is a client-side courtesy — it asks the
  // browser to drop the cookie, but the server itself kept no record, so
  // the identical (state, cookie) pair was still accepted from anyone
  // holding both, any number of times, inside the state's validity window.
  // This is the actual single-use enforcement.
  if (!(await trySpendNonce(getPool(), statePayload.nonce))) {
    return res.status(403).json({ error: "this connection link has already been used" });
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
    await upsertToken(pool, config.tokenKeyring, {
      tenantId: statePayload.tenantId,
      instagramAccountId: profile.id,
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
    });

    return res.status(200).json({ connected: true, instagramAccountId: profile.id, username: profile.username });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Instagram OAuth callback failed:", err);
    Sentry.captureException(err);
    return res.status(502).json({ error: "failed to complete Instagram connection" });
  }
});
