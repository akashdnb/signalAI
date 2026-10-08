import { PgBoss } from "pg-boss";

// Every idle poll is a round-trip to the external (Neon) database and counts
// as billable egress, so pg-boss's 2s default per queue adds up. Latency-
// sensitive queues poll faster than background/cron ones.
export const FAST_POLL = {
  pollingIntervalSeconds: Number(process.env.QUEUE_FAST_POLL_SECONDS ?? "5"),
};
export const BACKGROUND_POLL = {
  pollingIntervalSeconds: Number(process.env.QUEUE_BACKGROUND_POLL_SECONDS ?? "30"),
};

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing required env var: DATABASE_URL");
    }
    boss = new PgBoss(connectionString);
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
