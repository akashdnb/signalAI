import "./lib/sentryInit.js";
import { Sentry } from "./lib/sentry.js";
import { createApp } from "./app.js";
import { config, assertRequiredConfig } from "./config.js";
import { getPool } from "./db/pool.js";
import { getBoss } from "./queue/boss.js";
import { ensureQueues, LEAD_EVENTS_DLQ } from "./queue/leadEventsQueue.js";
import { ensureTokenRefreshQueue, startTokenRefreshWorker } from "./queue/tokenRefreshQueue.js";
import { ensureDataDeletionQueue, startDataDeletionWorker } from "./queue/dataDeletionQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker, sweepWedgedLeadEventJobs } from "./queue/worker.js";
import { createLLMProviderFromEnv, createEmbeddingProviderFromEnv } from "./llm/factory.js";
import type { LLMProvider } from "./llm/provider.js";
import { createLeadEventReplyHandler } from "./services/leadEventReplyHandler.js";
import { createProductionJourneyWorker } from "./domain/journey/actions/createProductionWorker.js";
import { pruneExpiredNonces } from "./db/oauthNonces.js";
import { pruneOldAiCallUsage } from "./db/aiCallUsage.js";
import { pruneExpiredOtpCodes } from "./db/emailOtpCodes.js";
import { ensureMaintenanceQueue, startMaintenanceWorker } from "./queue/maintenanceQueue.js";
import { ensureUsageRollupQueue, startUsageRollupWorker } from "./queue/usageRollupQueue.js";
import { ensureAlertsQueue, startAlertsWorker } from "./queue/alertsQueue.js";
import {
  enqueueUnknownUsernameResolutionJobs,
  ensureUsernameResolutionQueue,
  startUsernameResolutionWorker,
} from "./queue/usernameResolutionQueue.js";
import { ensureInstagramInboundQueue } from "./queue/instagramInboundQueue.js";
import { startInstagramInboundWorker } from "./queue/instagramInboundWorker.js";
import { ensureTenantScoringRefreshQueue, startTenantScoringRefreshWorker } from "./queue/tenantScoringRefreshQueue.js";
import { sendTelegramAlert } from "./lib/telegram.js";

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
  assertRequiredConfig();

  const pool = getPool();
  const boss = await getBoss();
  const llmProvider = loadLLMProviderOrFallback();
  const embeddingProvider = createEmbeddingProviderFromEnv();

  await ensureQueues(boss);
  await ensureTokenRefreshQueue(boss);
  await ensureDataDeletionQueue(boss);
  await ensureMaintenanceQueue(boss);
  await startMaintenanceWorker(boss, pool);
  await ensureUsageRollupQueue(boss);
  await startUsageRollupWorker(boss, pool);
  await ensureAlertsQueue(boss);
  await startAlertsWorker(boss, pool);
  await ensureUsernameResolutionQueue(boss);
  await startUsernameResolutionWorker(boss, pool, config.tokenKeyring);

  // Repair existing DM/comment leads that predate reliable username
  // enrichment. This is bounded; the hourly maintenance worker continues
  // the backfill after this first pass.
  const usernameBackfillQueued = await enqueueUnknownUsernameResolutionJobs(pool, boss, 100);
  if (usernameBackfillQueued > 0) {
    console.info(`Queued ${usernameBackfillQueued} Instagram username backfill job(s) on boot`);
  }

  await ensureTenantScoringRefreshQueue(boss);
  await startTenantScoringRefreshWorker(boss, pool);

  // Inbound Instagram webhooks are persisted + queued before HTTP
  // acknowledgement; this worker performs the durable journey processing.
  await ensureInstagramInboundQueue(boss);
  await startInstagramInboundWorker(boss, pool);

  await startLeadEventsWorker(
    boss,
    pool,
    createLeadEventReplyHandler(pool, boss, llmProvider, config.tokenKeyring, config.aiDailyCallCap, embeddingProvider),
  );
  await startDataDeletionWorker(boss, pool);

  await startDeadLetterWatcher(boss, pool, async (job) => {
    const message = `Lead event permanently failed, wedged at ${LEAD_EVENTS_DLQ}`;
    console.error(message, job);
    Sentry.captureMessage(message, { level: "error", extra: { job } });
    await sendTelegramAlert(`🚨 ${message}\n${JSON.stringify(job)}`);
  });

  const swept = await sweepWedgedLeadEventJobs(boss, pool);
  if (swept > 0) {
    console.warn(`Swept ${swept} wedged lead-event job(s) on boot`);
    Sentry.captureMessage(`Swept ${swept} wedged lead-event job(s) on boot`, { level: "warning" });
  }

  const prunedNonces = await pruneExpiredNonces(pool);
  if (prunedNonces > 0) {
    console.log(`Pruned ${prunedNonces} expired OAuth nonce(s) on boot`);
  }

  const prunedAiCalls = await pruneOldAiCallUsage(pool);
  if (prunedAiCalls > 0) {
    console.log(`Pruned ${prunedAiCalls} expired ai_call_usage row(s) on boot`);
  }

  const prunedOtpCodes = await pruneExpiredOtpCodes(pool);
  if (prunedOtpCodes > 0) {
    console.log(`Pruned ${prunedOtpCodes} expired email_otp_code row(s) on boot`);
  }

  await startTokenRefreshWorker(boss, pool, config.tokenKeyring, async (results) => {
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      console.error("Token refresh failures (Account Health Monitoring):", failures);
      Sentry.captureMessage("Token refresh failures (Account Health Monitoring)", {
        level: "error",
        extra: { failures },
      });
      await sendTelegramAlert(`⚠️ Token refresh failure(s) — Account Health Monitoring:\n${JSON.stringify(failures)}`);
    }
  });

  if (config.journeyWorkerEnabled) {
    const journeyWorkerProcess = createProductionJourneyWorker({ pool });

    console.info("Journey action worker enabled in API process");

    void journeyWorkerProcess.loop.start().catch((error) => {
      console.error("Embedded journey worker stopped unexpectedly", error);
      Sentry.captureException(error);
      process.exit(1);
    });
  }

  const app = createApp({ llmProvider, embeddingProvider });
  app.listen(config.port, () => {
    console.log(`signalAI server listening on :${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  Sentry.captureException(err);
  process.exit(1);
});
