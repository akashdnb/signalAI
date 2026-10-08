# Reduce outbound bandwidth (idle DB polling)

Render showed ~25 MB/hour "Service-Initiated" egress (4.32 GB/month). Cause: ~10 pg-boss
workers polling Neon every 2s (default) + journey worker idle backoff at 5s.

- `server/src/queue/boss.ts`: `FAST_POLL` (5s) / `BACKGROUND_POLL` (30s), env-overridable
  via `QUEUE_FAST_POLL_SECONDS` / `QUEUE_BACKGROUND_POLL_SECONDS`.
- Applied `pollingIntervalSeconds` to every `boss.work` call.
- `render.yaml`: `JOURNEY_WORKER_MAX_POLL_INTERVAL_MS` 5000 -> 15000.
