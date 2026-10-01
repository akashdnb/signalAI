import type { Pool } from "pg";

import {
  JourneyRuntime,
} from "../../../domain/journey/runtime.js";

import {
  createInstagramWebhookRouter,
} from "../../../routes/instagramWebhook.js";

export function createProductionInstagramWebhookRouter(
  pool: Pool,
) {
  const verifyToken =
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  const appSecret =
    process.env.INSTAGRAM_APP_SECRET;

  if (!verifyToken) {
    throw new Error(
      "INSTAGRAM_WEBHOOK_VERIFY_TOKEN is required",
    );
  }

  if (!appSecret) {
    throw new Error(
      "INSTAGRAM_APP_SECRET is required",
    );
  }

  return createInstagramWebhookRouter({
    pool,
    runtime: new JourneyRuntime(pool),
    verifyToken,
    appSecret,
  });
}
