import { Router, type Response } from "express";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { findTenantByInstagramAccountId } from "../db/accounts.js";
import { getConnectedInstagramAccount, repointInstagramAccountId } from "../db/connectedAccounts.js";
import { markTokenError, upsertToken } from "../db/tokens.js";
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
  subscribeToWebhooks,
} from "../lib/instagramOAuth.js";
import { Sentry } from "../lib/sentry.js";

export const authRouter = Router();

authRouter.post("/tenants/:tenantId/instagram/connect-link", requireTenantSession, async (req, res) => {
  const { tenantId } = req.params;
  const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : undefined;

  let instagramAccountId: string | undefined;
  if (accountId) {
    const account = await getConnectedInstagramAccount(getPool(), tenantId!, accountId);
    if (!account) return res.status(404).json({ error: "connected Instagram account not found" });
    instagramAccountId = account.instagramAccountId;
  }

  const { state: connectToken } = createOAuthState(config.metaAppSecret, tenantId!, instagramAccountId);
  const url = `${config.apiBaseUrl}/auth/instagram/start?tenantId=${tenantId}&connectToken=${encodeURIComponent(connectToken)}`;
  return res.status(200).json({ url });
});

authRouter.get("/auth/instagram/start", async (req, res) => {
  const tenantId = req.query.tenantId;
  const connectToken = req.query.connectToken;
  if (typeof tenantId !== "string" || !tenantId) return res.status(400).json({ error: "tenantId is required" });
  if (typeof connectToken !== "string" || !connectToken) return res.status(400).json({ error: "connectToken is required" });

  const connectPayload = verifyOAuthState(config.metaAppSecret, connectToken);
  if (!connectPayload || connectPayload.tenantId !== tenantId) {
    return res.status(401).json({ error: "invalid or expired connect link — please try connecting again" });
  }

  if (!(await trySpendNonce(getPool(), connectPayload.nonce))) {
    return res.status(401).json({ error: "invalid or expired connect link — please try connecting again" });
  }

  const { state, nonce } = createOAuthState(
    config.metaAppSecret,
    tenantId,
    connectPayload.instagramAccountId,
  );

  res.cookie(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
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
  if (!statePayload) return redirectToConnectError(res, "invalid_state");

  const cookieNonce = parseCookie(req.header("cookie"), OAUTH_NONCE_COOKIE);
  res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/auth/instagram" });
  if (!cookieNonce || !nonceMatches(cookieNonce, statePayload.nonce)) {
    return redirectToConnectError(res, "session_mismatch");
  }

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

    // On a reconnect the state carries the id of the account being reconnected.
    // It must be the same physical account that just authorised — matched by
    // the canonical user_id, or by the app-scoped id for accounts connected
    // before the id scheme switched to user_id (see fetchInstagramProfile).
    // Any other value means a different Instagram account was authorised.
    const reconnectId = statePayload.instagramAccountId;
    const isSameAccount =
      !reconnectId || reconnectId === profile.id || reconnectId === profile.appScopedId;
    if (!isSameAccount) {
      return redirectToConnectError(res, "account_mismatch");
    }

    const existingTenantId = await findTenantByInstagramAccountId(pool, profile.id);
    if (existingTenantId && existingTenantId !== tenantId) {
      return redirectToConnectError(res, "account_already_connected");
    }

    // Legacy account: stored under its app-scoped id. Repoint the existing row
    // to the canonical user_id so the upsert refreshes it (and its journey
    // bindings) in place rather than inserting a duplicate.
    if (reconnectId && reconnectId !== profile.id) {
      await repointInstagramAccountId(pool, tenantId, reconnectId, profile.id);
    }

    await upsertToken(pool, config.tokenKeyring, {
      tenantId,
      instagramAccountId: profile.id,
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
    });

    try {
      await subscribeToWebhooks(longLived.access_token);
    } catch (err) {
      console.error("Instagram webhook subscription failed:", err);
      Sentry.captureException(err);
      await markTokenError(pool, tenantId, profile.id, "Couldn't subscribe to Instagram notifications — try reconnecting.");
    }

    const trialUse = await registerInstagramTrialUse(pool, profile.id, tenantId);
    if (!trialUse.isFirstUse && trialUse.firstTenantId !== tenantId) {
      await endTrialImmediately(pool, tenantId);
    }

    return res.redirect(`${config.appBaseUrl}/dashboard/${tenantId}?connected=1`);
  } catch (err) {
    console.error("Instagram OAuth callback failed:", err);
    Sentry.captureException(err);
    return redirectToConnectError(res, "connection_failed");
  }
});
