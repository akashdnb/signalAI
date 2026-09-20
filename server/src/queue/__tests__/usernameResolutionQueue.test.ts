import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  ensureUsernameResolutionQueue,
  enqueueUsernameResolution,
  startUsernameResolutionWorker,
  USERNAME_RESOLUTION_QUEUE,
} from "../usernameResolutionQueue.js";

vi.mock("../../lib/instagramProfile.js", () => ({
  fetchInstagramUsername: vi.fn(async () => "resolved_handle"),
}));
import { fetchInstagramUsername } from "../../lib/instagramProfile.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);

async function seedMessageEvent(pool: ReturnType<typeof getPool>, tenantId: string) {
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, "ig-user-1");
  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: `evt-${Math.random()}`,
    eventType: "message",
    occurredAt: new Date(),
    sequence: 1,
  });
  await insertPii(pool, { tenantId, leadEventId: event!.id, leadId: lead.id, dmText: "hi" });
  return { lead, event: event! };
}

async function usernameFor(pool: ReturnType<typeof getPool>, leadEventId: string): Promise<string | null> {
  const row = await pool.query("select username from lead_pii where lead_event_id = $1", [leadEventId]);
  return row.rows[0]?.username ?? null;
}

describe("usernameResolutionQueue worker", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(fetchInstagramUsername).mockClear();
    vi.mocked(fetchInstagramUsername).mockResolvedValue("resolved_handle");
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureUsernameResolutionQueue(boss);
    // resetDb doesn't touch the pgboss schema, and other test files (e.g.
    // webhookIngestService.usernameResolution.test.ts) enqueue jobs on this
    // same queue without ever running a worker to consume them — without
    // this, a growing backlog of stale jobs (referencing tenants/leads
    // resetDb just truncated) sits ahead of this file's own job in the
    // queue and can push a real job past this suite's poll timeouts.
    await getPool().query("delete from pgboss.job where name = $1", [USERNAME_RESOLUTION_QUEUE]);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("resolves and backfills a username for a DM-only lead", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const { lead, event } = await seedMessageEvent(pool, tenant.id);

    await startUsernameResolutionWorker(boss, pool, keyring);
    await enqueueUsernameResolution(boss, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      instagramUserId: "ig-user-1",
    });

    const deadline = Date.now() + 10000;
    let username: string | null = null;
    while (Date.now() < deadline) {
      username = await usernameFor(pool, event.id);
      if (username) break;
      await sleep(250);
    }

    expect(username).toBe("resolved_handle");
    expect(fetchInstagramUsername).toHaveBeenCalledWith("token-1", "ig-user-1");
  }, 15000);

  it("skips the Graph API call entirely when the lead already has a username", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const { lead, event } = await seedMessageEvent(pool, tenant.id);

    // A comment on the same lead already supplied a username by the time
    // the resolution job runs.
    const commentEvent = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "already-commented",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 2,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: commentEvent!.id, leadId: lead.id, username: "already_known" });

    await startUsernameResolutionWorker(boss, pool, keyring);
    await enqueueUsernameResolution(boss, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      instagramUserId: "ig-user-1",
    });

    await sleep(2000); // give the worker a chance to (not) run

    expect(fetchInstagramUsername).not.toHaveBeenCalled();
    expect(await usernameFor(pool, event.id)).toBeNull(); // the DM event's own row is untouched
  }, 15000);

  it("does not throw when no Instagram account is connected — just leaves the username unresolved", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a"); // no upsertToken — nothing connected
    const { lead, event } = await seedMessageEvent(pool, tenant.id);

    await startUsernameResolutionWorker(boss, pool, keyring);
    await enqueueUsernameResolution(boss, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      instagramUserId: "ig-user-1",
    });

    await sleep(2000);

    expect(fetchInstagramUsername).not.toHaveBeenCalled();
    expect(await usernameFor(pool, event.id)).toBeNull();
  }, 15000);
});
