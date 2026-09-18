import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues, enqueueLeadEvent, LEAD_EVENTS_QUEUE } from "../leadEventsQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker, sweepWedgedLeadEventJobs } from "../worker.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// R3-08: deleting the source job to free the key must not also destroy
// the only evidence of what failed.
describe("R3-08: dead-letter evidence persistence and the boot sweep", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table dead_letter_events");
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

  it("records the job data and failure output before deleting the source job", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await startLeadEventsWorker(boss, pool, async () => {
      throw new Error("permanent failure for evidence test");
    });
    let deadLettered = false;
    await startDeadLetterWatcher(boss, pool, async () => {
      deadLettered = true;
    });

    await enqueueLeadEvent(boss, { tenantId: tenant.id, leadId: lead.id, leadEventId: "evt-evidence", sequence: 1 });

    const deadline = Date.now() + 50000;
    while (!deadLettered && Date.now() < deadline) {
      await sleep(1000);
    }
    expect(deadLettered).toBe(true);

    const rows = await pool.query(
      "select queue_name, source_job_id, job_data from dead_letter_events where queue_name = $1",
      [LEAD_EVENTS_QUEUE],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].job_data.leadEventId).toBe("evt-evidence");
  }, 60000);

  it("sweepWedgedLeadEventJobs is a no-op when there is nothing wedged", async () => {
    const swept = await sweepWedgedLeadEventJobs(boss, getPool());
    expect(swept).toBe(0);
  });
});
