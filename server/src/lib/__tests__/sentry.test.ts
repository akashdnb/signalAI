import { describe, expect, it } from "vitest";
import { initSentry, Sentry } from "../sentry.js";

// R1-04: Sentry must be safe to call without SENTRY_DSN set (local dev,
// test, and any environment where it hasn't been provisioned yet) — the
// alert wiring in index.ts calls captureException/captureMessage
// unconditionally, with no "is Sentry configured" branch of its own.
describe("Sentry init (R1-04)", () => {
  it("initializes without throwing when SENTRY_DSN is not set", () => {
    delete process.env.SENTRY_DSN;
    expect(() => initSentry()).not.toThrow();
  });

  it("captureException is a safe no-op without a configured DSN", () => {
    initSentry();
    expect(() => Sentry.captureException(new Error("test"))).not.toThrow();
  });

  it("captureMessage is a safe no-op without a configured DSN", () => {
    initSentry();
    expect(() => Sentry.captureMessage("test alert", { level: "error" })).not.toThrow();
  });
});
