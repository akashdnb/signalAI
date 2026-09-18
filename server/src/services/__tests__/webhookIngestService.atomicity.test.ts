import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";
import { ensureQueues, LEAD_EVENTS_QUEUE } from "../../queue/leadEventsQueue.js";
import { randomBytes } from "node:crypto";

// R1-01 regression: if the enqueue fails, nothing about this event should
// be visible afterward — not the lead, not the event row, not the PII.
// Before the fix, insertEventIdempotent committed on its own; a failure
// AFTER that point (here: enqueueing into a queue that was never created)
// left a permanently orphaned event that could never be re-enqueued,
// because a retry would hit the idempotency key and no-op.
describe("R1-01: webhook ingest is atomic — a failed enqueue leaves no trace", () => {
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
    // Deliberately do NOT call ensureQueues — sending to a queue that
    // doesn't exist throws, simulating a failure between "event persisted"
    // and "job enqueued". Explicitly delete it first: an earlier test file
    // in the same run may have already created it, and this test's whole
    // premise depends on the queue genuinely not existing.
    await boss.deleteQueue(LEAD_EVENTS_QUEUE).catch(() => undefined);
  });

  afterEach(async () => {
    // Restore the queue regardless of test order — a later file must
    // never observe the deleted-queue state this test deliberately creates.
    await ensureQueues(boss).catch(() => undefined);
    await boss.stop({ graceful: false });
  });

  afterAll(async () => {
    await closePool();
  });

  it("rolls back the lead, event, and PII when the enqueue step fails", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused",
    });

    await expect(
      ingestWebhookEvents(pool, boss, [
        {
          instagramAccountId: "acct-1",
          instagramUserId: "user-1",
          metaEventId: "evt-atomic-1",
          eventType: "comment",
          occurredAt: new Date(),
          commentText: "hello",
        },
      ]),
    ).rejects.toThrow();

    const leads = await pool.query("select count(*)::int as count from leads");
    const events = await pool.query("select count(*)::int as count from lead_events");
    const pii = await pool.query("select count(*)::int as count from lead_pii");

    expect(leads.rows[0].count).toBe(0);
    expect(events.rows[0].count).toBe(0);
    expect(pii.rows[0].count).toBe(0);
  });
});
