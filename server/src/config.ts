import { loadKeyring } from "./lib/tokenVault.js";

/**
 * A trailing slash on either URL setting is invisible in the dashboard and
 * breaks something different in each case, both silently and both AFTER a
 * successful OAuth:
 *
 *  - APP_BASE_URL: redirects become `https://host//connected`, and a path of
 *    `//connected` does not match BUI's `/connected` route, so the router
 *    falls through to its catch-all and bounces the user back to the connect
 *    page — looking exactly like a failed login despite the token being
 *    stored.
 *  - WEB_APP_ORIGIN: echoed verbatim as Access-Control-Allow-Origin. A
 *    browser's Origin header never carries a trailing slash, so the values
 *    don't match and EVERY cross-origin API call is blocked.
 *
 * Normalising here means the env value merely has to be right, not perfectly
 * formatted.
 */
function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

// Getters, not a frozen object: read live so tests (and anything else that
// sets process.env after this module first loads) see the current value.
export const config = {
  get port() { return Number(process.env.PORT ?? 3000); },
  get nodeEnv() { return process.env.NODE_ENV ?? "development"; },
  get metaAppSecret() { return process.env.META_APP_SECRET ?? ""; },
  get metaWebhookVerifyToken() { return process.env.META_WEBHOOK_VERIFY_TOKEN ?? ""; },
  get instagramClientId() { return process.env.INSTAGRAM_CLIENT_ID ?? ""; },
  get instagramHumanAgentEnabled() { return process.env.INSTAGRAM_HUMAN_AGENT_ENABLED === "true"; },
  get instagramRedirectUri() { return process.env.INSTAGRAM_REDIRECT_URI ?? ""; },
  get instagramGraphApiBaseUrl() { return process.env.INSTAGRAM_GRAPH_API_BASE_URL ?? "https://graph.facebook.com/v24.0"; },
  get instagramProfileGraphApiBaseUrl() { return process.env.INSTAGRAM_PROFILE_GRAPH_API_BASE_URL ?? "https://graph.instagram.com/v25.0"; },
  get stripeSecretKey() { return process.env.STRIPE_SECRET_KEY ?? ""; },
  get stripePriceId() { return process.env.STRIPE_PRICE_ID ?? ""; },
  get stripeWebhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET ?? ""; },
  get stripeStarterPriceId() { return process.env.STRIPE_STARTER_PRICE_ID || process.env.STRIPE_PRICE_ID || ""; },
  get stripeGrowthPriceId() { return process.env.STRIPE_GROWTH_PRICE_ID ?? ""; },
  get stripeMeterEventName() { return process.env.STRIPE_METER_EVENT_NAME ?? ""; },
  get trialDays() { return Number(process.env.TRIAL_DAYS ?? 14); },
  get trialTokenAllowance() { return Number(process.env.TRIAL_TOKEN_ALLOWANCE ?? 200_000); },
  get embeddingBaseUrl() { return process.env.EMBEDDING_BASE_URL ?? ""; },
  get embeddingApiKey() { return process.env.EMBEDDING_API_KEY ?? ""; },
  get embeddingModel() { return process.env.EMBEDDING_MODEL ?? ""; },
  get embeddingDimensions() { const raw = process.env.EMBEDDING_DIMENSIONS; return raw ? Number(raw) : undefined; },
  get kbS3Bucket() { return process.env.KB_S3_BUCKET ?? ""; },
  get ragMinSimilarityThreshold() { const raw = process.env.RAG_MIN_SIMILARITY_THRESHOLD; return raw ? Number(raw) : 0.6; },
  get appBaseUrl() { return stripTrailingSlashes(process.env.APP_BASE_URL ?? "http://localhost:3000"); },
  get apiBaseUrl() { return stripTrailingSlashes(process.env.API_BASE_URL ?? "http://localhost:3000"); },
  get journeyWorkerEnabled() { return process.env.JOURNEY_WORKER_ENABLED === "true"; },
  get resendApiKey() { return process.env.RESEND_API_KEY ?? ""; },
  get resendFromAddress() { return process.env.RESEND_FROM_ADDRESS ?? "signalAI <onboarding@resend.dev>"; },
  get telegramBotToken() { return process.env.TELEGRAM_BOT_TOKEN ?? ""; },
  get telegramChatId() { return process.env.TELEGRAM_CHAT_ID ?? ""; },
  get sessionSecret() { return process.env.SESSION_SECRET ?? ""; },
  get webAppOrigin() { return stripTrailingSlashes(process.env.WEB_APP_ORIGIN ?? ""); },
  get aiDailyCallCap() { return Number(process.env.AI_DAILY_CALL_CAP ?? 300); },
  get chatHistoryMaxTurns() { return Number(process.env.CHAT_HISTORY_MAX_TURNS ?? 10); },
  get tokenKeyring() { return loadKeyring(process.env.TOKEN_ENCRYPTION_KEYS); },
  // Internal capability/connector boundary. These are deliberately not
  // tenant credentials and must never contain provider API keys.
  get connectorsBaseUrl() { return stripTrailingSlashes(process.env.SIGNALAI_CONNECTORS_BASE_URL ?? ""); },
  get serviceToken() { return process.env.SIGNALAI_SERVICE_TOKEN ?? ""; },
  get connectorsRequestTimeoutMs() { return Number(process.env.SIGNALAI_CONNECTORS_TIMEOUT_MS ?? 15_000); },
};

export function isProduction(): boolean { return config.nodeEnv === "production"; }

export function assertWebAppOriginConfigured(origin: string): void {
  if (!origin) throw new Error("No WEB_APP_ORIGIN configured — refusing to fall back to a wildcard CORS origin");
}

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
    ["API_BASE_URL", process.env.API_BASE_URL ?? ""],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (config.tokenKeyring.size === 0) missing.push("TOKEN_ENCRYPTION_KEYS");
  if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(", ")}. The server refuses to start rather than run with a setting that would fail later.`);
}

export function assertInstagramOAuthConfigured(clientId: string, redirectUri: string): void {
  if (!clientId) throw new Error("No INSTAGRAM_CLIENT_ID configured — the OAuth authorize URL would be built with an empty client_id");
  if (!redirectUri) throw new Error("No INSTAGRAM_REDIRECT_URI configured — the OAuth authorize URL would be built with an empty redirect_uri");
}
