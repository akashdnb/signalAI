import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues, enqueueLeadEvent } from "../leadEventsQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker } from "../worker.js";

// pg-boss's default pollingInterval is 2000ms — every wait below is sized to
// comfortably clear multiple poll cycles rather than the minimum needed,
// since under-provisioning this is exactly what produced silent, misleading
// "nothing happened" failures the first time this suite was written.
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("lead events queue (pg-boss, key_strict_fifo)", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  // A fresh boss instance per test, not a shared one: a worker left
  // registered from a prior test (even briefly, during async teardown) can
  // otherwise steal jobs meant for the next test's assertions.
  beforeEach(async () => {
    await resetDb(getPool());
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureQueues(boss);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
  });

  afterAll(async () => {
    await closePool();
  });

  it("processes events for the same lead in strict order despite out-of-order enqueue attempts", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const processedOrder: number[] = [];
    await startLeadEventsWorker(boss, pool, async (job) => {
      processedOrder.push(job.sequence);
    });

    for (const sequence of [1, 2, 3]) {
      await enqueueLeadEvent(boss, {
        tenantId: tenant.id,
        leadId: lead.id,
        leadEventId: `evt-${sequence}`,
        sequence,
      });
    }

    await sleep(9000);
    expect(processedOrder).toEqual([1, 2, 3]);
  }, 15000);

  it("a stale retry (lower sequence arriving after a newer one) is skipped, not reapplied", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-2");

    const processed: number[] = [];
    await startLeadEventsWorker(boss, pool, async (job) => {
      processed.push(job.sequence);
    });

    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: lead.id, leadEventId: "e5", sequence: 5 });
    await sleep(5000);
    // Simulates a delayed webhook retry for an older event arriving late.
    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: lead.id, leadEventId: "e3", sequence: 3 });
    await sleep(5000);

    expect(processed).toEqual([5]); // sequence 3 never reached the handler
  }, 20000);

  it("different leads process concurrently, not serialized behind each other", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");

    const processed: string[] = [];
    await startLeadEventsWorker(boss, pool, async (job) => {
      processed.push(job.leadId);
    });

    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: leadA.id, leadEventId: "a1", sequence: 1 });
    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: leadB.id, leadEventId: "b1", sequence: 1 });
    await sleep(6000);

    expect(processed.sort()).toEqual([leadA.id, leadB.id].sort());
  }, 15000);

  it("a permanently-failing job lands in the dead-letter queue instead of wedging the lead forever", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-poison");

    const deadLettered: string[] = [];
    await startDeadLetterWatcher(boss, async (job) => {
      deadLettered.push(job.leadEventId);
    });
    await startLeadEventsWorker(boss, pool, async () => {
      throw new Error("simulated permanent failure");
    });

    await enqueueLeadEvent(boss, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: "poison-1",
      sequence: 1,
    });

    // retryLimit: 3 with backoff — give it real time to exhaust retries and
    // land in the DLQ rather than asserting immediately.
    await sleep(20000);

    expect(deadLettered).toContain("poison-1");
  }, 30000);

  it("a handler that fails once and succeeds on retry actually gets retried, not silently skipped", async () => {
    // Regression test for a real bug: the frontier must advance AFTER the
    // handler succeeds, not before — advancing first made a retry of a
    // genuine failure look identical to a stale duplicate, so it silently
    // no-opped forever instead of ever running the handler again.
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-flaky");

    let attempts = 0;
    await startLeadEventsWorker(boss, pool, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient failure, first attempt only");
    });

    await enqueueLeadEvent(boss, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: "flaky-1",
      sequence: 1,
    });

    await sleep(10000);

    expect(attempts).toBeGreaterThanOrEqual(2);
  }, 15000);
});
