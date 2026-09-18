import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues, enqueueLeadEvent } from "../leadEventsQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker } from "../worker.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// R1-03: does dead-lettering a permanently-failed job actually free its
// singletonKey under key_strict_fifo, or does the source job stay in a
// terminal "failed" state that keeps blocking the key forever? The DLQ
// design is worthless if the answer is the latter.
describe("R1-03: dead-lettering unblocks the singletonKey", () => {
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
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    // stop() resolving doesn't guarantee an in-flight poll callback has
    // finished — without this, a worker from this test can occasionally
    // steal a job meant for the next file's test, across a file boundary,
    // not just a test boundary within one file.
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("a second job for the same lead runs after the first is dead-lettered", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-poison");

    const processed: number[] = [];
    let deadLettered = false;
    await startLeadEventsWorker(boss, pool, async (job) => {
      if (job.sequence === 1) throw new Error("permanent failure");
      processed.push(job.sequence);
      return { advance: true };
    });
    await startDeadLetterWatcher(boss, pool, async () => {
      deadLettered = true;
    });

    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: lead.id, leadEventId: "e1", sequence: 1 });

    // Poll for the actual dead-letter event rather than a fixed sleep —
    // retryBackoff has a randomized component, so a fixed wait is
    // occasionally (correctly) too short and only ever flaky, never wrong
    // the other direction.
    const deadline = Date.now() + 50000;
    while (!deadLettered && Date.now() < deadline) {
      await sleep(1000);
    }
    expect(deadLettered).toBe(true);

    // Now enqueue job 2 for the SAME lead and see if it ever runs.
    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: lead.id, leadEventId: "e2", sequence: 2 });
    await sleep(6000);

    expect(processed).toEqual([2]);
  }, 60000);
});
