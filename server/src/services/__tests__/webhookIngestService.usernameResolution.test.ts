import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { ensureAlertsQueue } from "../../queue/alertsQueue.js";
import { ensureUsernameResolutionQueue, USERNAME_RESOLUTION_QUEUE } from "../../queue/usernameResolutionQueue.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolutionJobs(pool: ReturnType<typeof getPool>) {
  return pool.query<{ data: { tenantId: string; leadId: string; leadEventId: string; instagramUserId: string } }>(
    "select data from pgboss.job where name = $1",
    [USERNAME_RESOLUTION_QUEUE],
  );
}

// A DM webhook payload (and a shared-Reel message, which also arrives as a
// `messaging` event) never carries a username — unlike a comment, whose
// `from` object does. Without resolving it separately, a DM-only lead
// shows up as "(unknown)" in the dashboard forever.
describe("webhookIngestService — username resolution enqueue", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureQueues(boss);
    await ensureAlertsQueue(boss);
    await ensureUsernameResolutionQueue(boss);
    await getPool().query("delete from pgboss.job where name = $1", [USERNAME_RESOLUTION_QUEUE]);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("enqueues a resolution job for a message event with no username", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "ig-user-1",
        metaEventId: "msg-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "hi there",
        // no username — Meta's Messaging webhook never carries one
      },
    ]);

    const jobs = await resolutionJobs(pool);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]!.data).toMatchObject({ tenantId: tenant.id, instagramUserId: "ig-user-1" });
  });

  it("does not enqueue a resolution job for a comment event that already has a username", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "ig-user-1",
        metaEventId: "cmt-1",
        eventType: "comment",
        occurredAt: new Date(),
        commentText: "nice post!",
        username: "real_handle",
      },
    ]);

    const jobs = await resolutionJobs(pool);
    expect(jobs.rows).toHaveLength(0);
  });
});
