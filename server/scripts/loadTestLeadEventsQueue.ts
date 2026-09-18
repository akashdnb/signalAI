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
 * R1-13 fix: uses its own uniquely-suffixed queue names rather than the
 * app's real `lead-events`/`lead-events-dlq` — a killed or timed-out run
 * used to leave orphaned jobs behind on the shared queue that a later
 * vitest run's DLQ-watcher test would then pick up as a false failure.
 * This is a deliberately minimal, standalone re-implementation (not a
 * reuse of src/queue/*) since the point is measuring pg-boss's own
 * key_strict_fifo throughput, not exercising the app's reply pipeline.
 */
import { PgBoss } from "pg-boss";
import { getPool, closePool } from "../src/db/pool.js";
import { createTenant } from "../src/db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../src/db/leads.js";

async function main() {
  const leadCount = Number(process.argv[2] ?? 3000);
  const runId = Date.now();
  const queueName = `lead-events-loadtest-${runId}`;
  const dlqName = `${queueName}-dlq`;

  const pool = getPool();
  const boss = new PgBoss(process.env.DATABASE_URL!);
  await boss.start();
  await boss.createQueue(dlqName);
  await boss.createQueue(queueName, { policy: "key_strict_fifo", deadLetter: dlqName });

  console.log(`Provisioning ${leadCount} distinct leads (one event apiece)...`);
  const tenant = await createTenant(pool, `load-test-${runId}`);

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
      boss.send(queueName, { leadId, leadEventId: `load-evt-${i}` }, { singletonKey: leadId }),
    ),
  );
  const enqueueMs = Date.now() - enqueueStart;
  console.log(`Enqueued in ${enqueueMs}ms (${((leadCount / enqueueMs) * 1000).toFixed(0)} jobs/sec)`);

  let processed = 0;
  const processStart = Date.now();
  let lastProgressLog = processStart;

  await new Promise<void>((resolve) => {
    boss
      .work(queueName, { batchSize: 50, localConcurrency: 1 }, async (jobs) => {
        processed += jobs.length;
        const now = Date.now();
        if (now - lastProgressLog > 2000) {
          lastProgressLog = now;
          console.log(`  ...${processed}/${leadCount} processed (${now - processStart}ms elapsed)`);
        }
        if (processed >= leadCount) resolve();
      })
      .catch((err) => {
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

  await boss.deleteQueue(queueName).catch(() => undefined);
  await boss.deleteQueue(dlqName).catch(() => undefined);
  await boss.stop({ graceful: false });
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
