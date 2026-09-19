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
