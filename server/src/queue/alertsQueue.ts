import type { PgBoss } from "pg-boss";
import type { Pool, PoolClient } from "pg";
import { config } from "../config.js";
import { sendTelegramAlert } from "../lib/telegram.js";
import { publishNotificationEvent } from "../notifications/service.js";
import { asPgBossDb } from "./leadEventsQueue.js";
import { FAST_POLL, ensureNotifyQueue } from "./boss.js";

export const ALERTS_QUEUE = "alerts";

export interface NewLeadAlertJob {
  type: "new_lead";
  tenantId: string;
  leadId: string;
}

export async function ensureAlertsQueue(boss: PgBoss): Promise<void> {
  await ensureNotifyQueue(boss, ALERTS_QUEUE);
}

/**
 * R9-01 fix: `webhookIngestService.ts` used to await `sendTelegramAlert`
 * (an external HTTP call, 5s timeout) inline in the request path — every
 * new lead added that round-trip to Meta's ack latency, and it degraded
 * worst exactly when it mattered most: a viral Reel is mostly new leads,
 * so nearly every event in a burst paid it, right as Telegram's own
 * per-chat rate limit (~20 msg/min) started throttling the calls anyway.
 * `enqueueNewLeadAlert` is a fast local insert (no external call) — the
 * actual Telegram send happens in `startAlertsWorker`, off the ack path
 * entirely.
 *
 * `client`, when passed, rides the caller's own transaction (same
 * `Db`/`IDatabase` adapter as `enqueueLeadEvent`) — the alert job commits
 * or rolls back atomically with the rest of the ingest, so a lead that
 * never actually lands (a later failure in the same transaction) never
 * gets alerted on.
 */
export async function enqueueNewLeadAlert(
  boss: PgBoss,
  params: { tenantId: string; leadId: string },
  options?: { client?: PoolClient },
): Promise<void> {
  const job: NewLeadAlertJob = { type: "new_lead", ...params };
  await boss.send(ALERTS_QUEUE, job, {
    ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
  });
}

/**
 * R9-02 fix: the alert carries only `leadId`/`tenantId` and a dashboard
 * link — never the lead's username. A Telegram chat (or an alert email,
 * added Phase 2A) is a third-party store the Data Deletion Callback's
 * `hardScrubLead` can never reach; copying PII into it would mean a
 * deletion request could no longer satisfy erasure, since a scrubbed
 * username would still sit in the alert history (and, for the
 * unconfigured path, in stdout).
 *
 * Product notification delivery is handled through the persisted event and
 * preference system. The global Telegram message remains an operational
 * alert; user-facing channels follow each member's own workspace preference.
 */
export function startAlertsWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work<NewLeadAlertJob>(ALERTS_QUEUE, FAST_POLL, async (jobs) => {
    for (const job of jobs) {
      if (job.data.type === "new_lead") {
        const link = `${config.appBaseUrl}/tenants/${job.data.tenantId}/leads/${job.data.leadId}`;
        await sendTelegramAlert(`👋 New lead: ${link}`);

        // Fan out the real product event through persisted preferences and a
        // durable delivery ledger. The idempotency key is stable for this
        // lead event, so queue retries cannot create duplicate in-app alerts.
        try {
          await publishNotificationEvent(pool, boss, {
            tenantId: job.data.tenantId,
            eventType: "lead.created",
            idempotencyKey: `lead:${job.data.leadId}:created`,
            title: "New lead",
            message: "A new lead was added from an Instagram conversation.",
            entityType: "lead",
            entityId: job.data.leadId,
          });
        } catch (err) {
          // Keep provider/database details out of logs while retaining a useful event marker.
          // The publisher only resolves after its persistence transaction commits.
          console.error(JSON.stringify({
            event: "notification.fanout",
            eventType: "lead.created",
            workspaceId: job.data.tenantId,
            result: "failed",
            errorCode: "notification_persistence_failed",
          }));
        }
      }
    }
  });
}
