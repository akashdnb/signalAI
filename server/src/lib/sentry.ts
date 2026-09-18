import * as Sentry from "@sentry/node";

/**
 * R1-04 review fix: the DLQ "alert" and the token-refresh-failure signal
 * (Account Health Monitoring) were both `console.error` — stdout in a
 * Render container that nobody is watching, which doesn't meet the
 * roadmap's own done-condition for B4 ("fires an alert instead of wedging
 * a lead forever"). Initialized here, before anything else in index.ts,
 * per the B0 plan ("Sentry initialised before the first real request, not
 * after the first incident").
 *
 * Safe to call unconditionally without SENTRY_DSN set (local dev/test):
 * Sentry.init with no dsn produces a no-op client, so captureException
 * calls elsewhere in the app never need their own "is Sentry configured"
 * branch.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}

export { Sentry };
