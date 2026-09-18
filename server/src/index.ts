import { createApp } from "./app.js";
import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import { getBoss } from "./queue/boss.js";
import { ensureQueues, LEAD_EVENTS_DLQ } from "./queue/leadEventsQueue.js";
import { ensureTokenRefreshQueue, startTokenRefreshWorker } from "./queue/tokenRefreshQueue.js";
import { startDeadLetterWatcher } from "./queue/worker.js";

async function main() {
  const pool = getPool();
  const boss = await getBoss();

  await ensureQueues(boss);
  await ensureTokenRefreshQueue(boss);

  // Business-logic reply handlers (B6-B9) register on this same queue as
  // they land; wiring them up doesn't change this composition root.
  await startDeadLetterWatcher(boss, async (job) => {
    // eslint-disable-next-line no-console
    console.error(`Lead event permanently failed, wedged at ${LEAD_EVENTS_DLQ}:`, job);
  });

  await startTokenRefreshWorker(boss, pool, config.tokenKeyring, async (results) => {
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error("Token refresh failures (Account Health Monitoring):", failures);
    }
  });

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`signalAI server listening on :${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
