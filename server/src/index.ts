import { createApp } from "./app.js";
import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import { getBoss } from "./queue/boss.js";
import { ensureQueues, LEAD_EVENTS_DLQ } from "./queue/leadEventsQueue.js";
import { ensureTokenRefreshQueue, startTokenRefreshWorker } from "./queue/tokenRefreshQueue.js";
import { ensureDataDeletionQueue, startDataDeletionWorker } from "./queue/dataDeletionQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker } from "./queue/worker.js";
import { createLLMProviderFromEnv } from "./llm/factory.js";
import type { LLMProvider } from "./llm/provider.js";
import { createLeadEventReplyHandler } from "./services/leadEventReplyHandler.js";
import { assertKeyringConfigured } from "./lib/tokenVault.js";

/**
 * Every Phase 1 campaign defaults to rule_based, which never calls this —
 * so an unconfigured LLM provider must not crash startup. It degrades to
 * "every ai_generated campaign fails closed to its rule-based reply"
 * (replyEngine's own fallback path), not a boot failure.
 */
function loadLLMProviderOrFallback(): LLMProvider {
  try {
    return createLLMProviderFromEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "unconfigured",
      generateReply: async () => {
        throw new Error(`LLM provider unavailable: ${message}`);
      },
    };
  }
}

async function main() {
  // R1-10: fail at boot, not at the first token write in production —
  // this gates the whole account-connection flow, unlike the LLM provider
  // below, which has a real degrade-gracefully path.
  assertKeyringConfigured(config.tokenKeyring);

  const pool = getPool();
  const boss = await getBoss();
  const llmProvider = loadLLMProviderOrFallback();

  await ensureQueues(boss);
  await ensureTokenRefreshQueue(boss);
  await ensureDataDeletionQueue(boss);

  await startLeadEventsWorker(boss, pool, createLeadEventReplyHandler(pool, llmProvider));
  await startDataDeletionWorker(boss, pool);

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
