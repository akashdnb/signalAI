import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { trySpendNonce } from "../../db/oauthNonces.js";
import { recordAiCall } from "../../db/aiCallUsage.js";
import { createOtpCode } from "../../db/emailOtpCodes.js";
import { ensureMaintenanceQueue, startMaintenanceWorker, MAINTENANCE_QUEUE } from "../maintenanceQueue.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// R8-01: pruning used to run only at boot — this suite exercises the
// periodic path (the pg-boss queue + worker), not the boot-time calls,
// which are already covered by their own db-level unit tests. Triggers
// the worker via a direct send() rather than waiting on the real cron
// schedule, since the point here is "does the worker do the pruning when
// it runs," not "does pg-boss's scheduler fire on time."
describe("maintenance queue (R8-01 periodic pruning)", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table spent_oauth_nonces, ai_call_usage");
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureMaintenanceQueue(boss);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("registers the schedule without throwing", async () => {
    // ensureMaintenanceQueue already ran in beforeEach — this just asserts
    // pg-boss recorded it.
    const schedules = await boss.getSchedules();
    expect(schedules.some((s) => s.name === MAINTENANCE_QUEUE)).toBe(true);
  });

  it("prunes expired nonces, old AI call usage, and old email OTP codes when the job runs", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await trySpendNonce(pool, "old-nonce");
    await pool.query(`update spent_oauth_nonces set spent_at = now() - interval '48 hours'`);

    await recordAiCall(pool, tenant.id, "acct-old");
    await pool.query(`update ai_call_usage set called_at = now() - interval '48 hours'`);

    await createOtpCode(pool, "test-secret", "old@example.com", null);
    await pool.query(`update email_otp_codes set created_at = now() - interval '48 hours'`);

    await startMaintenanceWorker(boss, pool);
    await boss.send(MAINTENANCE_QUEUE, {});

    const deadline = Date.now() + 10000;
    let nonceCount = 1;
    while (Date.now() < deadline) {
      const result = await pool.query("select count(*)::int as count from spent_oauth_nonces");
      nonceCount = result.rows[0].count;
      if (nonceCount === 0) break;
      await sleep(500);
    }

    expect(nonceCount).toBe(0);

    const aiRows = await pool.query("select count(*)::int as count from ai_call_usage");
    expect(aiRows.rows[0].count).toBe(0); // actually deleted, not merely outside the 24h read window

    const codeRows = await pool.query("select count(*)::int as count from email_otp_codes");
    expect(codeRows.rows[0].count).toBe(0);
  }, 15000);
});
