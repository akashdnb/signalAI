import { loadKeyring } from "./lib/tokenVault.js";

// Getters, not a frozen object: read live so tests (and anything else that
// sets process.env after this module first loads) see the current value.
export const config = {
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  // Set once a real Meta app exists (Phase 0 / A4 prerequisite).
  get metaAppSecret() {
    return process.env.META_APP_SECRET ?? "";
  },
  get metaWebhookVerifyToken() {
    return process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  },
  get instagramClientId() {
    return process.env.INSTAGRAM_CLIENT_ID ?? "";
  },
  get instagramRedirectUri() {
    return process.env.INSTAGRAM_REDIRECT_URI ?? "";
  },
  // B11: Single Flat Plan via Stripe Checkout. Unset in dev/test — the
  // billing route degrades to a clear 503 rather than crashing (same
  // graceful-degradation pattern as the LLM provider).
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY ?? "";
  },
  get stripePriceId() {
    return process.env.STRIPE_PRICE_ID ?? "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET ?? "";
  },
  get appBaseUrl() {
    return process.env.APP_BASE_URL ?? "http://localhost:3000";
  },
  // R9-03: routed through config like every other setting, rather than
  // read directly from process.env in telegram.ts — a typo'd env var name
  // is then at least consistent with how every other misconfiguration in
  // this file surfaces (nothing validates these at boot either, same as
  // the Sentry DSN; only the token keyring gets a hard boot-time check).
  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN ?? "";
  },
  get telegramChatId() {
    return process.env.TELEGRAM_CHAT_ID ?? "";
  },
  // R10-01: signs the bearer session token issued at the end of a
  // successful Instagram connection (see lib/session.ts) — gates every
  // dashboard/campaigns/billing route, so this is validated at boot the
  // same way the token keyring is.
  get sessionSecret() {
    return process.env.SESSION_SECRET ?? "";
  },
  // R12-01/R12-02: the exact origin BUI is served from, echoed as
  // Access-Control-Allow-Origin (see app.ts). Routed through config like
  // every other setting; validated at boot via assertWebAppOriginConfigured
  // below rather than falling back to a silently permissive "*".
  get webAppOrigin() {
    return process.env.WEB_APP_ORIGIN ?? "";
  },
  // B10: hard per-account daily cap on AI-generated calls. Default chosen
  // to comfortably cover a real pilot conversation volume while still
  // bounding a viral-Reel worst case to a fixed cost (max_tokens is
  // already capped per call — see openAICompatibleProvider.ts).
  get aiDailyCallCap() {
    return Number(process.env.AI_DAILY_CALL_CAP ?? 300);
  },
  // Token vault keyring (see lib/tokenVault.ts) — re-parsed on every access
  // rather than cached, matching the live-read pattern above.
  get tokenKeyring() {
    return loadKeyring(process.env.TOKEN_ENCRYPTION_KEYS);
  },
};

export function isProduction(): boolean {
  return config.nodeEnv === "production";
}

/** R12-01: an unset WEB_APP_ORIGIN used to silently fall back to "*" in app.ts's CORS middleware — fail at boot instead, same treatment SESSION_SECRET and the token keyring already get. */
export function assertWebAppOriginConfigured(origin: string): void {
  if (!origin) {
    throw new Error("No WEB_APP_ORIGIN configured — refusing to fall back to a wildcard CORS origin");
  }
}

/**
 * Every externally-facing setting the server cannot function without, checked
 * in ONE place at boot.
 *
 * Added after the same failure recurred seven times across different
 * settings, each found from a downstream symptom rather than from the
 * server: an unset WEB_APP_ORIGIN silently became a wildcard CORS origin, an
 * unset INSTAGRAM_CLIENT_ID produced an authorize URL Instagram answered with
 * "this page isn't available", and an unset META_WEBHOOK_VERIFY_TOKEN made
 * the subscription handshake return 403, which Meta reports as "the callback
 * URL or verify token couldn't be validated". In all three the deploy
 * succeeded and the health check stayed green.
 *
 * Adding a getter above without adding it here (when it is required) is the
 * way this recurs, so the list is deliberately exhaustive rather than
 * per-feature. Genuinely optional settings — Stripe, Telegram, Sentry — are
 * excluded on purpose: those degrade gracefully by design.
 */
export function assertRequiredConfig(): void {
  const missing = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["META_APP_SECRET", config.metaAppSecret],
    ["META_WEBHOOK_VERIFY_TOKEN", config.metaWebhookVerifyToken],
    ["INSTAGRAM_CLIENT_ID", config.instagramClientId],
    ["INSTAGRAM_REDIRECT_URI", config.instagramRedirectUri],
    ["SESSION_SECRET", config.sessionSecret],
    ["WEB_APP_ORIGIN", config.webAppOrigin],
    ["APP_BASE_URL", process.env.APP_BASE_URL ?? ""],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (config.tokenKeyring.size === 0) missing.push("TOKEN_ENCRYPTION_KEYS");

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(", ")}. ` +
        "The server refuses to start rather than run with a setting that would " +
        "fail later, in someone else's browser, as an unrelated-looking error.",
    );
  }
}

/**
 * Both default to "" and were the only externally-facing settings without a
 * boot check. Unset, the server started normally and built an authorize URL
 * reading `?client_id=&redirect_uri=&scope=...`, which Instagram answers with
 * "Sorry, this page isn't available" — a dead end that looks like a Meta
 * problem, not a missing env var, because nothing anywhere said otherwise.
 * Same fail-at-boot rule the keyring, session secret, and CORS origin follow:
 * a missing externally-facing setting stops the process rather than producing
 * a broken artifact.
 */
export function assertInstagramOAuthConfigured(clientId: string, redirectUri: string): void {
  if (!clientId) {
    throw new Error("No INSTAGRAM_CLIENT_ID configured — the OAuth authorize URL would be built with an empty client_id");
  }
  if (!redirectUri) {
    throw new Error("No INSTAGRAM_REDIRECT_URI configured — the OAuth authorize URL would be built with an empty redirect_uri");
  }
}
