/**
 * B4 load-test gate (docs/phase0_phase1_impl_plan.md): key_strict_fifo's
 * documented weak spot is many unique singletonKeys with a shallow backlog
 * each — exactly a viral Reel's shape (thousands of distinct leads, one
 * comment apiece), as opposed to a few keys with deep backlogs, which is
 * the shape it's optimized for. This measures real throughput under that
 * shape instead of assuming the policy holds.
 *
 * Run: DATABASE_URL=... npx tsx scripts/loadTestLeadEventsQueue.ts [leadCount]
 *
 * Shares the real `lead-events`/`lead-events-dlq` queues with the app and
 * with the vitest suite. A killed or timed-out run can leave orphaned jobs
 * behind that a later vitest run's DLQ-watcher test will then pick up as
 * false failures. If that happens: `DROP SCHEMA pgboss CASCADE` on the test
 * DB and let the next `boss.start()` reprovision it, rather than debugging
 * the test.
 */
import { PgBoss } from "pg-boss";
import { getPool, closePool } from "../src/db/pool.js";
import { createTenant } from "../src/db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../src/db/leads.js";
import { ensureQueues, enqueueLeadEvent } from "../src/queue/leadEventsQueue.js";
import { startLeadEventsWorker } from "../src/queue/worker.js";

async function main() {
  const leadCount = Number(process.argv[2] ?? 3000);
  const pool = getPool();
  const boss = new PgBoss(process.env.DATABASE_URL!);
  await boss.start();
  await ensureQueues(boss);

  console.log(`Provisioning ${leadCount} distinct leads (one event apiece)...`);
  const tenant = await createTenant(pool, `load-test-${Date.now()}`);

  const leadIds: string[] = [];
  const provisionStart = Date.now();
  for (let i = 0; i < leadCount; i++) {
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, `load-test-user-${i}`);
    leadIds.push(lead.id);
  }
  console.log(`Provisioned in ${Date.now() - provisionStart}ms`);

  console.log(`Enqueuing ${leadCount} jobs, one distinct singletonKey each...`);
  const enqueueStart = Date.now();
  await Promise.all(
    leadIds.map((leadId, i) =>
      enqueueLeadEvent(boss, {
        tenantId: tenant.id,
        leadId,
        leadEventId: `load-evt-${i}`,
        sequence: 1,
      }),
    ),
  );
  const enqueueMs = Date.now() - enqueueStart;
  console.log(`Enqueued in ${enqueueMs}ms (${((leadCount / enqueueMs) * 1000).toFixed(0)} jobs/sec)`);

  let processed = 0;
  const processStart = Date.now();
  let lastProgressLog = processStart;

  await new Promise<void>((resolve) => {
    startLeadEventsWorker(boss, pool, async () => {
      processed += 1;
      const now = Date.now();
      if (now - lastProgressLog > 2000) {
        lastProgressLog = now;
        console.log(`  ...${processed}/${leadCount} processed (${now - processStart}ms elapsed)`);
      }
      if (processed >= leadCount) resolve();
    }).catch((err) => {
      console.error("Worker registration failed:", err);
      resolve();
    });

    // Safety timeout so this never hangs the terminal forever.
    setTimeout(() => {
      console.log(`Timed out at ${processed}/${leadCount} processed`);
      resolve();
    }, 180000);
  });

  const processMs = Date.now() - processStart;
  console.log(`\nResult: ${processed}/${leadCount} jobs processed in ${processMs}ms`);
  console.log(`Throughput: ${((processed / processMs) * 1000).toFixed(1)} jobs/sec`);

  await boss.stop({ graceful: false });
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
