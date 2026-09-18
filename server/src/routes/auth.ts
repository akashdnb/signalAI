import { Router } from "express";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { createTenant } from "../db/tenants.js";
import { upsertToken } from "../db/tokens.js";
import { OAUTH_NONCE_COOKIE, createOAuthState, nonceMatches, parseCookie, verifyOAuthState } from "../lib/oauthState.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "../lib/instagramOAuth.js";

export const authRouter = Router();

// Starts the connect flow. A pilot creator with no tenant yet passes
// tenantName (Phase 1 has no separate signup step — connecting Instagram
// *is* the signup); one reconnecting an existing account passes tenantId.
authRouter.get("/auth/instagram/start", async (req, res) => {
  const pool = getPool();
  const tenantName = req.query.tenantName;
  const existingTenantId = req.query.tenantId;

  let tenantId: string;
  if (typeof existingTenantId === "string") {
    tenantId = existingTenantId;
  } else if (typeof tenantName === "string" && tenantName.length > 0) {
    const tenant = await createTenant(pool, tenantName);
    tenantId = tenant.id;
  } else {
    return res.status(400).json({ error: "tenantName or tenantId is required" });
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
  res.clearCookie(OAUTH_NONCE_COOKIE);
  if (!cookieNonce || !nonceMatches(cookieNonce, statePayload.nonce)) {
    return res.status(403).json({ error: "missing or mismatched oauth session — please restart the connection" });
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
    return res.status(502).json({ error: "failed to complete Instagram connection" });
  }
});
