import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { mergeCapturedFacts } from "../../db/capturedFacts.js";
import { recalculateLeadIntelligence } from "../../services/leadScoring.js";
import { getLeadIntelligence, listLeadIntelligenceHistory } from "../../db/leadIntelligence.js";
import { createScoringRule, updateScoringRule } from "../../db/leadScoringRules.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  ensureTenantScoringRefreshQueue,
  enqueueTenantScoringRefresh,
  startTenantScoringRefreshWorker,
  TENANT_SCORING_REFRESH_QUEUE,
} from "../tenantScoringRefreshQueue.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(300);
  }
  throw new Error("waitUntil timed out");
}

/** Jobs pg-boss still considers "pending" for this queue — not yet completed/failed/cancelled. */
async function countPendingJobs(queueName: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `select count(*)::text as count from pgboss.job where name = $1 and state in ('created', 'retry', 'active')`,
    [queueName],
  );
  return Number(result.rows[0]?.count ?? "0");
}

describe("tenant scoring refresh queue (Objective B)", () => {
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
    await ensureTenantScoringRefreshQueue(boss);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("registers the queue without throwing", async () => {
    const queue = await boss.getQueue(TENANT_SCORING_REFRESH_QUEUE);
    expect(queue).toBeTruthy();
  });

  it("applies a newly created rule to an existing lead's intelligence", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy" }); // score 25 under the base model
    await recalculateLeadIntelligence(pool, tenant.id, lead.id);
    expect((await getLeadIntelligence(pool, tenant.id, lead.id))!.score).toBe(25);

    await createScoringRule(pool, tenant.id, {
      name: "Intent bonus",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);

    await waitUntil(async () => {
      const intelligence = await getLeadIntelligence(pool, tenant.id, lead.id);
      return intelligence?.score === 35;
    });
  }, 15000);

  it("stops applying a disabled rule's points on the next refresh", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy" });

    const rule = await createScoringRule(pool, tenant.id, {
      name: "Intent bonus",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });
    await recalculateLeadIntelligence(pool, tenant.id, lead.id); // picks up the rule directly, same as the route would trigger
    expect((await getLeadIntelligence(pool, tenant.id, lead.id))!.score).toBe(35);

    await updateScoringRule(pool, tenant.id, rule.id, { enabled: false });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);

    await waitUntil(async () => {
      const intelligence = await getLeadIntelligence(pool, tenant.id, lead.id);
      return intelligence?.score === 25;
    });
  }, 15000);

  it("never refreshes another tenant's leads", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-b");
    await mergeCapturedFacts(pool, tenantA.id, leadA.id, { intent: "ready_to_buy" });
    await mergeCapturedFacts(pool, tenantB.id, leadB.id, { intent: "ready_to_buy" });
    await recalculateLeadIntelligence(pool, tenantA.id, leadA.id);
    await recalculateLeadIntelligence(pool, tenantB.id, leadB.id);

    await createScoringRule(pool, tenantA.id, {
      name: "Tenant A only",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenantA.id);

    await waitUntil(async () => (await getLeadIntelligence(pool, tenantA.id, leadA.id))?.score === 35);

    // Tenant B was never refreshed and has no rule of its own anyway —
    // its score must be untouched.
    expect((await getLeadIntelligence(pool, tenantB.id, leadB.id))!.score).toBe(25);
  }, 15000);

  it("does not create duplicate history rows when the refresh is retried / run again with no change", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy" });
    await recalculateLeadIntelligence(pool, tenant.id, lead.id);

    await createScoringRule(pool, tenant.id, {
      name: "Intent bonus",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);
    await waitUntil(async () => (await getLeadIntelligence(pool, tenant.id, lead.id))?.score === 35);

    const historyAfterFirstRefresh = await listLeadIntelligenceHistory(pool, tenant.id, lead.id);

    // Running the deterministic recalculation again directly (what a retry
    // or a second debounced job would do) must not add another row, since
    // nothing about the effective intelligence changed.
    await recalculateLeadIntelligence(pool, tenant.id, lead.id);
    await recalculateLeadIntelligence(pool, tenant.id, lead.id);

    const historyAfterRepeats = await listLeadIntelligenceHistory(pool, tenant.id, lead.id);
    expect(historyAfterRepeats.length).toBe(historyAfterFirstRefresh.length);
  }, 15000);

  it("handles a tenant with zero leads without error", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);

    // Nothing to assert on data — the point is that the job completes
    // (doesn't throw/dead-letter) and the queue drains.
    await waitUntil(async () => (await countPendingJobs(TENANT_SCORING_REFRESH_QUEUE)) === 0);
  }, 15000);

  it("coalesces rapid repeated sends for the same tenant into a single pending job", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await enqueueTenantScoringRefresh(boss, tenant.id);
    await enqueueTenantScoringRefresh(boss, tenant.id);
    await enqueueTenantScoringRefresh(boss, tenant.id);

    expect(await countPendingJobs(TENANT_SCORING_REFRESH_QUEUE)).toBe(1);
  });

  // Objective 4 (follow-up review): documents the CHOSEN refresh semantics
  // explicitly, rather than leaving it implicit in listLeadIdsWithIntelligence's
  // query. A lead that has never had intelligence calculated (no captured
  // facts, no milestone ever reached, no AI reply ever delivered) has
  // nothing a scoring rule could affect — its "no intelligence yet" state
  // from leadIntelligence.ts is itself a valid, intentional product state,
  // not an omission. Refreshing it would mean calculating a score of 0 and
  // writing a brand-new history row for a lead the rule change couldn't
  // possibly have changed anything about, for every untouched lead a
  // tenant has — unbounded, wasteful, and not what "existing lead
  // intelligence must not remain silently stale" asked for.
  it("only refreshes leads that already have an intelligence projection — a lead with captured facts but no prior recalculation is left with none", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const untouchedLead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-untouched");
    // Facts captured, but recalculateLeadIntelligence was never called for
    // this lead — mirrors a lead whose only AI turn never got far enough
    // to be delivered/committed (leadEventReplyHandler.ts's deferred-commit
    // invariant), or a lead created before any scoring ever ran.
    await mergeCapturedFacts(pool, tenant.id, untouchedLead.id, { intent: "ready_to_buy" });
    expect(await getLeadIntelligence(pool, tenant.id, untouchedLead.id)).toBeNull();

    await createScoringRule(pool, tenant.id, {
      name: "Intent bonus",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);
    await waitUntil(async () => (await countPendingJobs(TENANT_SCORING_REFRESH_QUEUE)) === 0);

    expect(await getLeadIntelligence(pool, tenant.id, untouchedLead.id)).toBeNull();
  }, 15000);

  // Concurrency: the worker must read whichever rules exist AT RUN TIME,
  // never anything captured in the job payload at enqueue time — two rule
  // mutations landing back-to-back (the debounce window coalesces their
  // enqueues into one pending job) must both be reflected once that one
  // job actually runs.
  it("converges to the state of ALL rule mutations made before the job ran, not just the one that triggered the send", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy", location: "Bangalore" });
    await recalculateLeadIntelligence(pool, tenant.id, lead.id); // score 35 (intent 25 + location 10)

    // Two rapid mutations — only one enqueue actually lands (coalesced by
    // the debounce window), but by the time the worker runs both must be
    // reflected: +10 intent bonus AND +5 location bonus = score 50.
    await createScoringRule(pool, tenant.id, {
      name: "Intent bonus",
      definition: { kind: "field_compare", field: "intent", operator: "eq", value: "ready_to_buy" },
      points: 10,
    });
    await createScoringRule(pool, tenant.id, {
      name: "Location bonus",
      definition: { kind: "field_compare", field: "location", operator: "eq", value: "Bangalore" },
      points: 5,
    });

    await startTenantScoringRefreshWorker(boss, pool);
    await enqueueTenantScoringRefresh(boss, tenant.id);

    await waitUntil(async () => (await getLeadIntelligence(pool, tenant.id, lead.id))?.score === 50);
  }, 15000);
});
