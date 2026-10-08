# Reduce outbound bandwidth (idle DB polling)

Render showed ~25 MB/hour "Service-Initiated" egress (4.32 GB/month). Cause: ~10 pg-boss
workers polling Neon every 2s (default) + journey worker idle backoff at 5s.

- `server/src/queue/boss.ts`: `FAST_POLL` (5s) / `BACKGROUND_POLL` (30s), env-overridable
  via `QUEUE_FAST_POLL_SECONDS` / `QUEUE_BACKGROUND_POLL_SECONDS`.
- Applied `pollingIntervalSeconds` to every `boss.work` call.
- `render.yaml`: `JOURNEY_WORKER_MAX_POLL_INTERVAL_MS` 5000 -> 15000.

## Follow-up: LISTEN/NOTIFY (Render bandwidth nearly exhausted)

- `boss.ts`: `useListenNotify: true`, listener heartbeat 10s -> 30s, pg-boss internal
  timers slowed (cron worker 5s -> 45s, supervise/monitor/queue-cache 60s -> 300s).
- `ensureNotifyQueue()` creates every queue with `notify: true` and `updateQueue`s
  existing ones (createQueue is a no-op for existing queues).
- Workers: NOTIFY wakes them instantly; `notifyPollingIntervalSeconds` is only a backstop
  (60s fast / 300s background; also covers delayed retries). `pollingIntervalSeconds`
  (10s / 120s) only applies if the listener is unavailable.
- `render.yaml`: journey worker max idle poll 15s -> 30s (custom loop, not pg-boss).
- `vitest.config.ts`: 1s polls in tests (tests build their own PgBoss w/o listener).
- Caveat: LISTEN needs a DIRECT Neon connection string (not the `-pooler` host).
  On a pooled URL pg-boss warns `listen_notify_unavailable` and falls back to base polling.
