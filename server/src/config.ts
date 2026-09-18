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
