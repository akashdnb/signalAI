import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { sendTelegramAlert } from "../../lib/telegram.js";
import { ensureAlertsQueue, enqueueNewLeadAlert, startAlertsWorker, ALERTS_QUEUE } from "../alertsQueue.js";

vi.mock("../../lib/telegram.js", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("alertsQueue worker", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(sendTelegramAlert).mockClear();
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureAlertsQueue(boss);
    // resetDb doesn't touch the pgboss schema — a job left behind by
    // webhookIngestService.newLead.test.ts (which enqueues but never
    // consumes, by design) would otherwise be the first thing this
    // file's worker picks up, not the job this test itself enqueues.
    await getPool().query("delete from pgboss.job where name = $1", [ALERTS_QUEUE]);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("sends a Telegram alert with a dashboard link, no PII, when a new-lead job runs", async () => {
    await startAlertsWorker(boss);
    await enqueueNewLeadAlert(boss, { tenantId: "tenant-1", leadId: "lead-1" });

    const deadline = Date.now() + 10000;
    while (vi.mocked(sendTelegramAlert).mock.calls.length === 0 && Date.now() < deadline) {
      await sleep(500);
    }

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    const [text] = vi.mocked(sendTelegramAlert).mock.calls[0]!;
    expect(text).toContain("tenant-1");
    expect(text).toContain("lead-1");
  }, 15000);

  it("registers under the expected queue name", () => {
    expect(ALERTS_QUEUE).toBe("alerts");
  });
});
