# Changelog

All notable changes to SignalAI are documented here.

## 2026-10-11 — Free-tier bandwidth protection

### Performance

- Added private browser cache revalidation for `GET`/`HEAD` API responses using `Cache-Control: private, no-cache` and `Vary: Authorization`.
  - Allows unchanged dashboard/API responses to be served as lightweight `304 Not Modified` responses instead of retransmitting the full JSON payload.
  - Keeps personalized tenant/user responses private and isolated by bearer token.
- Reduced pg-boss polling frequency by default to lower external database round-trips and associated outbound bandwidth on the Render free tier.
- Made pg-boss `LISTEN/NOTIFY` opt-in through `QUEUE_USE_LISTEN_NOTIFY`.
  - Disabled by default because the current Render free-tier deployment uses Neon's pooled endpoint, where `LISTEN/NOTIFY` is unavailable.
  - `QUEUE_USE_LISTEN_NOTIFY=true` can be enabled for a future direct-database/paid deployment.
- Disabled pg-boss queue notifications when `LISTEN/NOTIFY` is disabled to avoid unnecessary notification traffic.
- Increased pg-boss background polling intervals and internal maintenance intervals to favor bandwidth efficiency over unnecessary idle database traffic.

### Operational notes

- These changes are intentionally optimized for the October 2026 free-tier deployment while SignalAI is still pre-revenue.
- No API contract or response payload changes are introduced.
- The optimizations can be relaxed later when paid infrastructure is available and lower queue latency is preferred.
