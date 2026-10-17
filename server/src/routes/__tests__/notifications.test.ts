import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { notificationRetryDelayMs, publishNotificationEvent, startNotificationDeliveryWorker } from "../../notifications/service.js";
import { getBoss, stopBoss } from "../../queue/boss.js";
import { ensureNotificationQueue } from "../../notifications/service.js";

const SESSION_SECRET = "test-session-secret";

describe("notification routes and durable event delivery", () => {
  let boss: Awaited<ReturnType<typeof getBoss>>;

  beforeAll(async () => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database.");
    boss = await getBoss();
    await ensureNotificationQueue(boss);
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("delete from pgboss.job where name = $1", ["notification-deliveries"]);
    delete process.env.RESEND_API_KEY;
  });

  afterAll(async () => {
    await stopBoss();
    await closePool();
  });

  it("returns persisted defaults, saves only the current user's preferences, and rejects invalid channels", async () => {
    const { tenant, user, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-settings");
    const app = createApp();
    const loaded = await request(app).get(`/tenants/${tenant.id}/notifications/preferences`).set(authHeader);
    expect(loaded.status).toBe(200);
    expect(loaded.body.events.find((event: { type: string }) => event.type === "lead.created").channels)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "in_app", enabled: true, available: true }),
        expect.objectContaining({ type: "email", enabled: false, available: false }),
      ]));

    const saved = await request(app).put(`/tenants/${tenant.id}/notifications/preferences`).set(authHeader).send({
      preferences: [{ eventType: "lead.created", channel: "in_app", enabled: false }],
    });
    expect(saved.status).toBe(200);
    const invalid = await request(app).put(`/tenants/${tenant.id}/notifications/preferences`).set(authHeader).send({
      preferences: [{ eventType: "lead.created", channel: "telegram", enabled: true }],
    });
    expect(invalid.status).toBe(400);
    const rows = await getPool().query("select * from notification_preferences where tenant_id = $1 and user_id = $2", [tenant.id, user.id]);
    expect(rows.rows).toHaveLength(1);
  });

  it("rejects access by a non-member and never lists another workspace's notifications", async () => {
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-a");
    const { tenant: tenantB } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-b");
    const app = createApp();

    expect((await request(app).get(`/tenants/${tenantB.id}/notifications`).set(authA)).status).toBe(403);
    await publishNotificationEvent(getPool(), boss, {
      tenantId: tenantA.id, eventType: "lead.created", idempotencyKey: "lead:a", title: "New lead",
      message: "A new lead was added.", entityType: "lead", entityId: "lead-a",
    });
    const own = await request(app).get(`/tenants/${tenantA.id}/notifications`).set(authA);
    expect(own.status).toBe(200);
    expect(own.body.notifications).toHaveLength(1);
    expect(own.body.notifications[0].entityId).toBe("lead-a");
    const other = await getPool().query("select count(*)::int as count from notifications where tenant_id = $1", [tenantB.id]);
    expect(other.rows[0].count).toBe(0);
  });

  it("deduplicates retries, fans out only to workspace members, and supports read history", async () => {
    const { tenant, authHeader, user } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-idempotency");
    const member = await findOrCreateUserByEmail(getPool(), "notice-member@example.com");
    await getPool().query("insert into tenant_members (tenant_id,user_id,role) values ($1,$2,'member')", [tenant.id, member.id]);

    const input = {
      tenantId: tenant.id, eventType: "automation.execution_failed" as const,
      idempotencyKey: "execution:run-123:failed", title: "Automation failed",
      message: "Review the automation run.", entityType: "execution", entityId: "run-123",
    };
    const first = await publishNotificationEvent(getPool(), boss, input);
    const duplicate = await publishNotificationEvent(getPool(), boss, input);
    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ eventId: first.eventId, duplicate: true });
    const rows = await getPool().query("select user_id from notifications where event_id = $1 order by user_id", [first.eventId]);
    expect(rows.rows.map((row) => row.user_id).sort()).toEqual([user.id, member.id].sort());

    const app = createApp();
    const inbox = await request(app).get(`/tenants/${tenant.id}/notifications`).set(authHeader);
    expect(inbox.body.notifications).toHaveLength(1);
    const read = await request(app).patch(`/tenants/${tenant.id}/notifications/${inbox.body.notifications[0].id}/read`).set(authHeader);
    expect(read.status).toBe(200);
    const inboxAgain = await request(app).get(`/tenants/${tenant.id}/notifications`).set(authHeader);
    expect(inboxAgain.body.unreadCount).toBe(0);
  });

  it("does not claim provider success on a rejected email response", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const { tenant, user } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-provider");
    await getPool().query(
      "insert into notification_preferences (tenant_id,user_id,event_type,channel,enabled) values ($1,$2,'lead.created','email',true)",
      [tenant.id, user.id],
    );
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "rejected" }), {
      status: 422, headers: { "content-type": "application/json" },
    }));
    try {
      const result = await publishNotificationEvent(getPool(), boss, {
        tenantId: tenant.id, eventType: "lead.created", idempotencyKey: "provider-failed",
        title: "New lead", message: "A lead arrived.",
      });
      const delivery = await getPool().query("select id,status,attempts from notification_deliveries where event_id = $1 and channel = 'email'", [result.eventId]);
      expect(delivery.rows[0].status).toBe("pending"); // no provider success is recorded before a send
      await startNotificationDeliveryWorker(boss, getPool());
      const deadline = Date.now() + 5000;
      let persisted = { status: "pending", attempts: 0 };
      while (Date.now() < deadline) {
        const current = await getPool().query<{ status: string; attempts: number }>(
          "select status,attempts from notification_deliveries where id = $1", [delivery.rows[0].id],
        );
        persisted = current.rows[0] ?? persisted;
        if (persisted.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(fetchSpy).toHaveBeenCalled();
      expect(persisted).toMatchObject({ status: "failed", attempts: 1 });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("uses a bounded exponential retry schedule", () => {
    expect(notificationRetryDelayMs(1)).toBe(30_000);
    expect(notificationRetryDelayMs(2)).toBe(60_000);
    expect(notificationRetryDelayMs(3)).toBe(120_000);
    expect(notificationRetryDelayMs(4)).toBe(240_000);
    expect(notificationRetryDelayMs(5)).toBe(240_000);
  });
  it("requires authentication for preference/history operations", async () => {
    const { tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "notice-auth");
    const app = createApp();
    expect((await request(app).get(`/tenants/${tenant.id}/notifications`)).status).toBe(401);
    expect((await request(app).get(`/tenants/${tenant.id}/notifications/preferences`)).status).toBe(401);
  });
});
