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
  // Phase 2B Plan Tiers: two paid tiers above the Phase 1 flat plan
  // (stripePriceId above stays the 'starter' tier's price for anyone
  // still on the original single-plan Checkout link). Both genuinely
  // optional — a tier whose price id is unset simply can't be checked out
  // into yet, same graceful-degradation shape as billing overall.
  get stripeStarterPriceId() {
    return process.env.STRIPE_STARTER_PRICE_ID || process.env.STRIPE_PRICE_ID || "";
  },
  get stripeGrowthPriceId() {
    return process.env.STRIPE_GROWTH_PRICE_ID ?? "";
  },
  // Phase 2B Daily Usage Rollup -> Stripe Metered Billing: the Billing
  // Meter's event_name, configured on the Stripe dashboard side. Unset
  // means the rollup job still aggregates internally (that's the real
  // ledger) but skips the Stripe sync call, logging instead — same
  // "internal source of truth stays correct even if the external sync
  // can't run" shape as every other optional integration here.
  get stripeMeterEventName() {
    return process.env.STRIPE_METER_EVENT_NAME ?? "";
  },
  // Phase 2B Free Trial Period. Deliberately a plain number of days, not
  // a token-budget-shaped setting — see trialTokenAllowance below for that
  // half.
  get trialDays() {
    return Number(process.env.TRIAL_DAYS ?? 14);
  },
  // Phase 2B Trial Token Allowance: a cumulative cap for the WHOLE trial,
  // separate from aiDailyCallCap above (a rolling 24h CALL-count ceiling
  // that applies to every tenant regardless of tier). This one is
  // TOKEN-based and trial-only — a trial account can't outrun it by
  // spreading calls across many days the way a daily call cap alone would
  // allow.
  get trialTokenAllowance() {
    return Number(process.env.TRIAL_TOKEN_ALLOWANCE ?? 200_000);
  },
  // Phase 2C Knowledge Base: a dedicated embeddings endpoint, independent
  // of whatever LLM_BASE_URL is configured for chat — not every chat host
  // (Groq, DeepSeek) also serves embeddings, so this is never assumed to
  // be the same provider. Genuinely optional: unset means KB upload
  // degrades to a clear 503, same shape as Stripe/Resend below.
  get embeddingBaseUrl() {
    return process.env.EMBEDDING_BASE_URL ?? "";
  },
  get embeddingApiKey() {
    return process.env.EMBEDDING_API_KEY ?? "";
  },
  get embeddingModel() {
    return process.env.EMBEDDING_MODEL ?? "";
  },
  // Matryoshka-style truncation request (see embeddingProvider.ts) —
  // genuinely optional, unlike the three above: a model whose natural
  // output width already matches knowledge_base_chunks.embedding's fixed
  // vector(768) column (e.g. OpenAI's text-embedding-3-small) needs this
  // unset. gemini-embedding-001 (this project's actual configured model,
  // confirmed live) natively returns 3072 dims and needs it set to 768.
  get embeddingDimensions() {
    const raw = process.env.EMBEDDING_DIMENSIONS;
    return raw ? Number(raw) : undefined;
  },
  // Phase 2C Knowledge Base: the S3-compatible bucket for uploaded source
  // documents. Endpoint/region/credentials are read by the AWS SDK itself
  // from its own standard env vars (AWS_ENDPOINT_URL_S3, AWS_REGION,
  // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) — only the bucket name isn't
  // one of those, so it's the one setting routed through config here.
  get kbS3Bucket() {
    return process.env.KB_S3_BUCKET ?? "";
  },
  // Phase 2C Grounded-Answer-Only Fallback: cosine similarity below which
  // the best retrieval match is treated as "not actually grounded." 0.6 is
  // a starting point, not a measured value — real embedding models (and
  // Matryoshka-truncated ones especially, see EMBEDDING_DIMENSIONS) can
  // have different similarity distributions, so this is exposed as a
  // tunable rather than hardcoded.
  get ragMinSimilarityThreshold() {
    const raw = process.env.RAG_MIN_SIMILARITY_THRESHOLD;
    return raw ? Number(raw) : 0.6;
  },
  get appBaseUrl() {
    return stripTrailingSlashes(process.env.APP_BASE_URL ?? "http://localhost:3000");
  },
  // Identity Refactor U2: the API server's OWN public base URL. Used to
  // build the Instagram connect-link redirect target (routes/auth.ts) —
  // distinct from appBaseUrl (BUI's URL) because the two are different
  // hosts in every real deployment of this project. No longer used by
  // sign-in itself: the email-OTP flow (routes/authEmail.ts) is a plain
  // JSON POST from the SPA, not a server-built redirect URL.
  get apiBaseUrl() {
    return stripTrailingSlashes(process.env.API_BASE_URL ?? "http://localhost:3000");
  },
  // Identity Refactor U2: optional, unlike every other setting below this
  // point being "genuinely optional" — see lib/resend.ts's docstring for
  // why an unconfigured Resend still has a real (not silent) fallback.
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get resendFromAddress() {
    return process.env.RESEND_FROM_ADDRESS ?? "signalAI <onboarding@resend.dev>";
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
  // R10-01, superseded by the Identity Refactor: signs the bearer session
  // token issued at the end of email-OTP verification (see lib/session.ts
  // and routes/authEmail.ts) — gates every dashboard/campaigns/billing
  // route, so this is validated at boot the
  // same way the token keyring is.
  get sessionSecret() {
    return process.env.SESSION_SECRET ?? "";
  },
  // R12-01/R12-02: the exact origin BUI is served from, echoed as
  // Access-Control-Allow-Origin (see app.ts). Routed through config like
  // every other setting; validated at boot via assertWebAppOriginConfigured
  // below rather than falling back to a silently permissive "*".
  get webAppOrigin() {
    return stripTrailingSlashes(process.env.WEB_APP_ORIGIN ?? "");
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
    ["API_BASE_URL", process.env.API_BASE_URL ?? ""],
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
