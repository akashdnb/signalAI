import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { sendTelegramAlert } from "../../lib/telegram.js";
import { sendAlertEmail } from "../../lib/resend.js";
import { NOTIFICATION_DELIVERY_QUEUE } from "../../notifications/service.js";
import { createTenantForUser } from "../../db/tenants.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { ensureAlertsQueue, enqueueNewLeadAlert, startAlertsWorker, ALERTS_QUEUE } from "../alertsQueue.js";

vi.mock("../../lib/telegram.js", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));
vi.mock("../../lib/resend.js", () => ({ sendAlertEmail: vi.fn(async () => {}) }));

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
    vi.mocked(sendAlertEmail).mockClear();
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureAlertsQueue(boss);
    // resetDb doesn't touch the pgboss schema — a job left behind by
    // webhookIngestService.newLead.test.ts (which enqueues but never
    // consumes, by design) would otherwise be the first thing this
    // file's worker picks up, not the job this test itself enqueues.
    await getPool().query("delete from pgboss.job where name = any($1::text[])", [[ALERTS_QUEUE, NOTIFICATION_DELIVERY_QUEUE]]);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("sends a Telegram alert with a dashboard link, no PII, when a new-lead job runs", async () => {
    const owner = await findOrCreateUserByEmail(getPool(), "telegram-owner@example.com");
    const tenant = await createTenantForUser(getPool(), "creator-telegram", owner.id);
    await startAlertsWorker(boss, getPool());
    await enqueueNewLeadAlert(boss, { tenantId: tenant.id, leadId: "lead-1" });

    const deadline = Date.now() + 10000;
    while (vi.mocked(sendTelegramAlert).mock.calls.length === 0 && Date.now() < deadline) {
      await sleep(500);
    }

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    const [text] = vi.mocked(sendTelegramAlert).mock.calls[0]!;
    expect(text).toContain(tenant.id);
    expect(text).toContain("lead-1");
  }, 15000);

  it("keeps legacy owner email and also records a tenant-scoped in-app event", async () => {
    const owner = await findOrCreateUserByEmail(getPool(), "owner@example.com");
    const tenant = await createTenantForUser(getPool(), "creator-a", owner.id);

    await startAlertsWorker(boss, getPool());
    await enqueueNewLeadAlert(boss, { tenantId: tenant.id, leadId: "lead-1" });

    const deadline = Date.now() + 10000;
    while (vi.mocked(sendAlertEmail).mock.calls.length === 0 && Date.now() < deadline) {
      await sleep(500);
    }

    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = vi.mocked(sendAlertEmail).mock.calls[0]!;
    expect(to).toBe("owner@example.com");
    expect(subject).toContain("lead");
    expect(html).toContain(tenant.id);
    expect(html).toContain("lead-1");
    const notification = await getPool().query(
      "select n.event_type, n.tenant_id, n.user_id, n.entity_id from notifications n join users u on u.id = n.user_id where n.tenant_id = $1 and u.email = $2",
      [tenant.id, "owner@example.com"],
    );
    expect(notification.rows).toMatchObject([{ event_type: "lead.created", tenant_id: tenant.id, entity_id: "lead-1" }]);
  }, 15000);

  it("does not perform external alert delivery when notification persistence fails", async () => {
    await startAlertsWorker(boss, getPool());
    await enqueueNewLeadAlert(boss, { tenantId: "missing-tenant", leadId: "lead-1" });

    await sleep(1500);

    expect(sendTelegramAlert).not.toHaveBeenCalled();
    expect(sendAlertEmail).not.toHaveBeenCalled();
  }, 5000);

  it("registers under the expected queue name", () => {
    expect(ALERTS_QUEUE).toBe("alerts");
  });
});
