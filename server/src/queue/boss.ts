import { PgBoss } from "pg-boss";

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
