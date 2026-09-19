import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { sendTelegramAlert } from "../../lib/telegram.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";

vi.mock("../../lib/telegram.js", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// B11: "Telegram alerts for new leads." Only the FIRST contact from a
// given Instagram user should alert — every subsequent event from the
// same lead is a returning conversation, not a new one.
describe("webhookIngestService — new lead Telegram alert (B11)", () => {
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
    await ensureQueues(boss);
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

  it("alerts once on first contact, not again on a second event from the same lead", async () => {
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

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    expect(sendTelegramAlert).toHaveBeenCalledWith(expect.stringContaining("real_handle"));

    vi.mocked(sendTelegramAlert).mockClear();

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

    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it("does not alert when the enqueue fails and the transaction rolls back", async () => {
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

    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });
});
