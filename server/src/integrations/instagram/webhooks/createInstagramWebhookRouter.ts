import type { Pool } from "pg";

import {
  JourneyRuntime,
} from "../../../domain/journey/runtime.js";

import {
  createInstagramWebhookRouter,
} from "../../../routes/instagramWebhook.js";

import { config } from "../../../config.js";

export function createProductionInstagramWebhookRouter(
  pool: Pool,
) {
  const verifyToken =
    config.metaWebhookVerifyToken;

  const appSecret =
    config.metaAppSecret;

  if (!verifyToken) {
    throw new Error(
      "META_WEBHOOK_VERIFY_TOKEN is required",
    );
  }

  if (!appSecret) {
    throw new Error(
      "META_APP_SECRET is required",
    );
  }

  return createInstagramWebhookRouter({
    pool,
    runtime: new JourneyRuntime(pool),
    verifyToken,
    appSecret,
  });
}
