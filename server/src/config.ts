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
};

export function isProduction(): boolean {
  return config.nodeEnv === "production";
}
