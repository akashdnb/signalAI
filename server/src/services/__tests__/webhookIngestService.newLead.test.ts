import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { ensureAlertsQueue, ALERTS_QUEUE } from "../../queue/alertsQueue.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function alertJobs(pool: ReturnType<typeof getPool>) {
  return pool.query<{ data: { type: string; tenantId: string; leadId: string } }>(
    "select data from pgboss.job where name = $1",
    [ALERTS_QUEUE],
  );
}

// B11: "Telegram alerts for new leads." Only the FIRST contact from a
// given Instagram user should alert — every subsequent event from the
// same lead is a returning conversation, not a new one.
//
// R9-01 fix: this used to assert `sendTelegramAlert` (the external
// Telegram call) was invoked synchronously inside the ingest path. It no
// longer is — ingest now only enqueues a fast local job (this file's
// concern); the actual Telegram send happens in alertsQueue.ts's worker,
// covered by its own test. Asserting on the enqueue is what actually
// tests "did the ack path stay fast."
describe("webhookIngestService — new lead alert enqueue (B11/R9-01)", () => {
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
    // resetDb doesn't touch the pgboss schema, and nothing in this file
    // ever runs a worker to consume enqueued alert jobs — without this,
    // a job left behind by one test (or a previous file) is still sitting
    // in the queue when the next test's assertion counts rows.
    await getPool().query("delete from pgboss.job where name = $1", [ALERTS_QUEUE]);
  });

  afterEach(async () => {
    // A test below deliberately deletes the lead-events queue — restore it
    // regardless of test order so a later file never observes that state.
    await ensureQueues(boss).catch(() => undefined);
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("enqueues exactly one alert job on first contact, none on a second event from the same lead", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "comment",
        occurredAt: new Date(),
        commentText: "hi",
        username: "real_handle",
      },
    ]);

    const firstJobs = await alertJobs(pool);
    expect(firstJobs.rows).toHaveLength(1);
    expect(firstJobs.rows[0]!.data).toMatchObject({ type: "new_lead", tenantId: tenant.id });
    // R9-02: the job payload must never carry the username or any other PII.
    expect(JSON.stringify(firstJobs.rows[0]!.data)).not.toContain("real_handle");

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "comment",
        occurredAt: new Date(),
        commentText: "hi again",
        username: "real_handle",
      },
    ]);

    const secondJobs = await alertJobs(pool);
    expect(secondJobs.rows).toHaveLength(1); // still just the one from first contact
  });

  it("does not enqueue an alert when the ingest transaction rolls back", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await boss.deleteQueue("lead-events");
    await expect(
      ingestWebhookEvents(pool, boss, [
        {
          instagramAccountId: "acct-1",
          instagramUserId: "user-rollback",
          metaEventId: "evt-rollback",
          eventType: "comment",
          occurredAt: new Date(),
          commentText: "hi",
        },
      ]),
    ).rejects.toThrow();

    const jobs = await alertJobs(pool);
    expect(jobs.rows).toHaveLength(0);
  });
});
