import { PgBoss } from "pg-boss";

// Every idle poll is a round-trip to the external (Neon) database and counts
// as billable egress. Queues are created with `notify: true` and the instance
// runs a LISTEN connection, so new jobs wake workers instantly and polling is
// only a slow backstop (notifyPollingIntervalSeconds — also covers delayed
// retries, which don't emit a NOTIFY when they become runnable).
// pollingIntervalSeconds only applies if the listener is unavailable (e.g. a
// pooled Neon endpoint, which can't LISTEN), so keep it moderate.
export const FAST_POLL = {
  pollingIntervalSeconds: Number(process.env.QUEUE_FAST_POLL_SECONDS ?? "10"),
  notifyPollingIntervalSeconds: Number(process.env.QUEUE_FAST_NOTIFY_POLL_SECONDS ?? "60"),
};
export const BACKGROUND_POLL = {
  pollingIntervalSeconds: Number(process.env.QUEUE_BACKGROUND_POLL_SECONDS ?? "120"),
  notifyPollingIntervalSeconds: Number(process.env.QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS ?? "300"),
};

/** createQueue is a no-op for an existing queue, so updateQueue backfills `notify` on queues created before this change. */
export async function ensureNotifyQueue(
  boss: PgBoss,
  name: string,
  options: Omit<Parameters<PgBoss["createQueue"]>[1] & object, "notify"> = {},
): Promise<void> {
  await boss.createQueue(name, { ...options, notify: true });
  await boss.updateQueue(name, { notify: true });
}

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing required env var: DATABASE_URL");
    }
    boss = new PgBoss({
      connectionString,
      useListenNotify: true,
      // Heartbeat queries on the LISTEN connection are egress too (default 10s).
      notifyHeartbeatIntervalMs: 30_000,
      // pg-boss's own timers (cron worker 5s, supervise/monitor/cache 60s)
      // also hit the DB on a loop; our jobs are hour-scale cron or tolerate
      // slow retry/expiry detection, so run them at the slowest allowed rate.
      cronWorkerIntervalSeconds: 45,
      cronMonitorIntervalSeconds: 45,
      superviseIntervalSeconds: 300,
      monitorIntervalSeconds: 300,
      queueCacheIntervalSeconds: 300,
    });
    await boss.start();
  }
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: false });
    boss = undefined;
  }
}
