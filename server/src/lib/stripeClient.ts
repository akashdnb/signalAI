import Stripe from "stripe";
import { config } from "../config.js";

/**
 * B11: Single Flat Plan via Stripe Checkout. Constructed lazily (not a
 * module-level singleton) so tests and an unconfigured dev/test
 * environment never pay for a Stripe client that's never used — same
 * "unconfigured means a clear error at the point of use, not at import
 * time" shape as the LLM provider factory.
 */
export function getStripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(config.stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
}

export function isBillingConfigured(): boolean {
  return Boolean(config.stripeSecretKey && config.stripePriceId);
}
