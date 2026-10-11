import { PgBoss } from "pg-boss";

export type QueueConfig = {
  useListenNotify: boolean;
  interactivePoll: {
    pollingIntervalSeconds: number;
    notifyPollingIntervalSeconds: number;
  };
  fastPoll: {
    pollingIntervalSeconds: number;
    notifyPollingIntervalSeconds: number;
  };
  backgroundPoll: {
    pollingIntervalSeconds: number;
    notifyPollingIntervalSeconds: number;
  };
};

/**
 * Render Free currently uses Neon's pooled endpoint. LISTEN/NOTIFY is not
 * available through that pooler, so pg-boss repeatedly attempts to register a
 * listener and falls back to polling anyway. Keep LISTEN opt-in for a future
 * paid/direct-database deployment, but avoid the failed listener connection
 * and its heartbeat traffic on the free-tier deployment.
 *
 * Interactive queues get a tighter polling interval because they sit directly
 * on the Instagram webhook -> AI reply path. Background work can tolerate the
 * slower interval and saves more database egress while the free-tier limit is
 * tight.
 */
export function getQueueConfig(env: NodeJS.ProcessEnv = process.env): QueueConfig {
  const useListenNotify = env.QUEUE_USE_LISTEN_NOTIFY === "true";
  return {
    useListenNotify,
    interactivePoll: {
      pollingIntervalSeconds: Number(env.QUEUE_INTERACTIVE_POLL_SECONDS ?? "10"),
      notifyPollingIntervalSeconds: Number(env.QUEUE_INTERACTIVE_NOTIFY_POLL_SECONDS ?? "10"),
    },
    fastPoll: {
      pollingIntervalSeconds: Number(env.QUEUE_FAST_POLL_SECONDS ?? "30"),
      notifyPollingIntervalSeconds: Number(env.QUEUE_FAST_NOTIFY_POLL_SECONDS ?? "60"),
    },
    backgroundPoll: {
      pollingIntervalSeconds: Number(env.QUEUE_BACKGROUND_POLL_SECONDS ?? "300"),
      notifyPollingIntervalSeconds: Number(env.QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS ?? "600"),
    },
  };
}

const QUEUE_CONFIG = getQueueConfig();

export const QUEUE_USE_LISTEN_NOTIFY = QUEUE_CONFIG.useListenNotify;
export const INTERACTIVE_POLL = QUEUE_CONFIG.interactivePoll;
export const FAST_POLL = QUEUE_CONFIG.fastPoll;
export const BACKGROUND_POLL = QUEUE_CONFIG.backgroundPoll;

/**
 * createQueue is a no-op for an existing queue, so updateQueue backfills the
 * notification setting on queues created before this change. When LISTEN is
 * disabled there is no reason to generate NOTIFY traffic either.
 */
export async function ensureNotifyQueue(
  boss: PgBoss,
  name: string,
  options: Omit<Parameters<PgBoss["createQueue"]>[1] & object, "notify"> = {},
): Promise<void> {
  await boss.createQueue(name, {
    ...options,
    notify: QUEUE_USE_LISTEN_NOTIFY,
  });
  await boss.updateQueue(name, {
    notify: QUEUE_USE_LISTEN_NOTIFY,
  });
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
      useListenNotify: QUEUE_USE_LISTEN_NOTIFY,
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
    // pg-boss re-emits connection drops (incl. the LISTEN connection) as
    // 'error'; unhandled, Node exits. It reconnects on its own.
    boss.on("error", (err) => console.error("pg-boss error:", err.message));
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
