import type { Pool } from "pg";
import type { PgBoss, Job } from "pg-boss";
import { getUserById } from "../db/users.js";
import { config } from "../config.js";
import { NOTIFICATION_EVENTS, type NotificationChannel, type NotificationEventType, type NotificationSeverity } from "./catalog.js";
import { deliverNotificationEmail } from "./providers.js";

export const NOTIFICATION_DELIVERY_QUEUE = "notification-deliveries";
const MAX_ATTEMPTS = 5;

export interface PublishNotificationInput {
  tenantId: string;
  eventType: NotificationEventType;
  idempotencyKey: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  /** A product event can target one workspace member; omitted means all current members. */
  recipientUserId?: string;
}

function safeDisplayText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function notificationRetryDelayMs(attempt: number): number {
  // 30s, 60s, 120s, 240s, then terminal after the fifth attempt.
  return Math.min(30_000 * (2 ** Math.max(0, attempt - 1)), 4 * 60_000);
}

function asSafeErrorCode(code: string): string {
  return /^[a-z0-9_]{1,80}$/.test(code) ? code : "provider_error";
}

export async function ensureNotificationQueue(boss: PgBoss): Promise<void> {
  const { ensureNotifyQueue } = await import("../queue/boss.js");
  await ensureNotifyQueue(boss, NOTIFICATION_DELIVERY_QUEUE);
  await boss.schedule(NOTIFICATION_DELIVERY_QUEUE, "*/1 * * * *", { type: "sweep-due" }, { tz: "UTC" });
}

/**
 * Idempotently records a product event and fans it out to workspace members.
 * Delivery rows, in-app rows and event receipt live in one transaction. All
 * recipient IDs originate from tenant_members (or the explicitly validated
 * recipient), never from notification API request bodies.
 */
export async function publishNotificationEvent(pool: Pool, boss: PgBoss, input: PublishNotificationInput): Promise<{ eventId: string; duplicate: boolean }> {
  const definition = NOTIFICATION_EVENTS.find((entry) => entry.type === input.eventType);
  if (!definition) throw new Error("unsupported_notification_event");
  const idempotencyKey = safeDisplayText(input.idempotencyKey, 200);
  if (!idempotencyKey) throw new Error("notification_idempotency_key_required");

  const client = await pool.connect();
  let eventId: string;
  let duplicate = false;
  try {
    await client.query("begin");
    const severity = input.severity ?? definition.defaultSeverity;
    const inserted = await client.query<{ id: string }>(
      `insert into notification_events
        (tenant_id, event_type, idempotency_key, severity, title, message, entity_type, entity_id, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       on conflict (tenant_id, event_type, idempotency_key) do nothing
       returning id`,
      [
        input.tenantId, input.eventType, idempotencyKey, severity,
        safeDisplayText(input.title, 160), safeDisplayText(input.message, 500),
        input.entityType ? safeDisplayText(input.entityType, 60) : null,
        input.entityId ? safeDisplayText(input.entityId, 200) : null,
        JSON.stringify(input.payload ?? {}),
      ],
    );

    if (!inserted.rows[0]) {
      const existing = await client.query<{ id: string }>(
        "select id from notification_events where tenant_id = $1 and event_type = $2 and idempotency_key = $3",
        [input.tenantId, input.eventType, idempotencyKey],
      );
      if (!existing.rows[0]) throw new Error("notification_idempotency_conflict_unresolved");
      eventId = existing.rows[0].id;
      duplicate = true;
      await client.query("commit");
      return { eventId, duplicate };
    }

    eventId = inserted.rows[0].id;
    const memberResult = input.recipientUserId
      ? await client.query<{ user_id: string }>(
          "select user_id from tenant_members where tenant_id = $1 and user_id = $2",
          [input.tenantId, input.recipientUserId],
        )
      : await client.query<{ user_id: string }>(
          "select user_id from tenant_members where tenant_id = $1 order by created_at",
          [input.tenantId],
        );
    const recipients = memberResult.rows.map((row) => row.user_id);
    if (input.recipientUserId && recipients.length === 0) {
      throw new Error("notification_recipient_not_in_workspace");
    }

    for (const userId of recipients) {
      const preferences = await client.query<{ channel: NotificationChannel; enabled: boolean }>(
        "select channel, enabled from notification_preferences where tenant_id = $1 and user_id = $2 and event_type = $3",
        [input.tenantId, userId, input.eventType],
      );
      const prefMap = new Map(preferences.rows.map((row) => [row.channel, row.enabled]));
      // In-app is enabled by default unless explicitly disabled. External email
      // is opt-in to avoid sending unexpectedly to every workspace member.
      const channels: NotificationChannel[] = [];
      if (prefMap.get("in_app") ?? true) channels.push("in_app");
      if (prefMap.get("email") ?? false) channels.push("email");

      for (const channel of (["in_app", "email"] as const)) {
        const shouldDeliver = channels.includes(channel);
        const status = shouldDeliver ? "pending" : "disabled";
        const delivery = await client.query<{ id: string }>(
          `insert into notification_deliveries
             (event_id, tenant_id, recipient_user_id, channel, status, max_attempts, provider)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (event_id, recipient_user_id, channel) do nothing
           returning id`,
          [eventId, input.tenantId, userId, channel, status, MAX_ATTEMPTS, channel === "email" ? "resend" : "internal"],
        );

        if (channel === "in_app" && shouldDeliver) {
          await client.query(
            `insert into notifications
              (event_id, tenant_id, user_id, event_type, title, message, severity, entity_type, entity_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (event_id, user_id) do nothing`,
            [eventId, input.tenantId, userId, input.eventType, safeDisplayText(input.title, 160),
              safeDisplayText(input.message, 500), severity, input.entityType ?? null, input.entityId ?? null],
          );
          if (delivery.rows[0]) {
            await client.query(
              "update notification_deliveries set status = 'delivered', attempts = 1, delivered_at = now(), updated_at = now() where id = $1",
              [delivery.rows[0].id],
            );
          }
        } else if (channel === "email" && shouldDeliver && delivery.rows[0]) {
          await boss.send(NOTIFICATION_DELIVERY_QUEUE, { deliveryId: delivery.rows[0].id }, {
            retryLimit: 0,
            db: (await import("../queue/leadEventsQueue.js")).asPgBossDb(client),
          });
        }
      }
    }
    await client.query("commit");
    return { eventId, duplicate: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function startNotificationDeliveryWorker(boss: PgBoss, pool: Pool): Promise<string> {
  return boss.work<{ deliveryId: string; type?: string }>(NOTIFICATION_DELIVERY_QUEUE, { localConcurrency: 2 }, async (jobs: Job<{ deliveryId: string; type?: string }>[]) => {
    for (const job of jobs) {
      if (job.data.type === "sweep-due") {
        // Recover interrupted claims from a worker restart. Ambiguous provider
        // outcomes can cause a duplicate external send, but attempts are bounded.
        await pool.query(
          "update notification_deliveries set status = case when attempts < max_attempts then 'retrying' else 'failed' end, next_attempt_at = case when attempts < max_attempts then now() else null end, last_error_code = 'worker_interrupted', updated_at = now() where channel = 'email' and status = 'processing' and updated_at < now() - interval '10 minutes'"
        );
        await pool.query(
          "update notification_deliveries set status = 'failed', next_attempt_at = null, last_error_code = 'retry_limit_exhausted', updated_at = now() where channel = 'email' and status = 'retrying' and attempts >= max_attempts"
        );
        const due = await pool.query<{ id: string }>(
          `select id from notification_deliveries
            where channel = 'email' and status = 'retrying'
              and next_attempt_at is not null and next_attempt_at <= now()
              and attempts < max_attempts
            order by next_attempt_at asc limit 100`,
        );
        for (const row of due.rows) {
          const claim = await pool.query(
            `update notification_deliveries set status = 'pending', updated_at = now()
              where id = $1 and status = 'retrying' and next_attempt_at <= now() returning id`,
            [row.id],
          );
          if (claim.rowCount) {
            await boss.send(NOTIFICATION_DELIVERY_QUEUE, { deliveryId: row.id }, { retryLimit: 0 });
          }
        }
        continue;
      }
      const deliveryId = job.data.deliveryId;
      const claim = await pool.query<{
        id: string; event_id: string; tenant_id: string; recipient_user_id: string;
        channel: string; attempts: number; max_attempts: number;
      }>(
        `update notification_deliveries d
            set status = 'processing', attempts = attempts + 1, updated_at = now()
          where d.id = $1 and d.channel = 'email' and d.status in ('pending','retrying') and d.attempts < d.max_attempts
          returning d.id, d.event_id, d.tenant_id, d.recipient_user_id, d.channel, d.attempts, d.max_attempts`,
        [deliveryId],
      );
      const delivery = claim.rows[0];
      if (!delivery) continue;

      const eventResult = await pool.query<{
        event_type: string; title: string; message: string; payload: Record<string, unknown>;
      }>(
        "select event_type, title, message, payload from notification_events where id = $1 and tenant_id = $2",
        [delivery.event_id, delivery.tenant_id],
      );
      const event = eventResult.rows[0];
      const recipient = await getUserById(pool, delivery.recipient_user_id);
      const membership = await pool.query(
        "select 1 from tenant_members where tenant_id = $1 and user_id = $2",
        [delivery.tenant_id, delivery.recipient_user_id],
      );
      const preference = event ? await pool.query<{ enabled: boolean }>(
        "select enabled from notification_preferences where tenant_id = $1 and user_id = $2 and event_type = $3 and channel = 'email'",
        [delivery.tenant_id, delivery.recipient_user_id, event.event_type],
      ) : { rows: [] as Array<{ enabled: boolean }> };

      let result: Awaited<ReturnType<typeof deliverNotificationEmail>>;
      if (!event || !recipient) {
        result = { ok: false, provider: "resend", failureClass: "permanent", errorCode: "recipient_or_event_missing" };
      } else if (!membership.rowCount) {
        await pool.query("update notification_deliveries set status = 'disabled', last_error_code = 'recipient_membership_removed', next_attempt_at = null, updated_at = now() where id = $1", [delivery.id]);
        continue;
      } else if (preference.rows[0]?.enabled !== true) {
        await pool.query("update notification_deliveries set status = 'disabled', last_error_code = 'preference_disabled', next_attempt_at = null, updated_at = now() where id = $1", [delivery.id]);
        continue;
      } else if (delivery.channel !== "email") {
        result = { ok: false, provider: "resend", failureClass: "permanent", errorCode: "unsupported_channel" };
      } else {
        // Only controlled display fields are used here; no event payload is interpolated into email.
        const link = `${config.appBaseUrl}/dashboard/${delivery.tenant_id}/settings`;
        result = await deliverNotificationEmail({
          to: recipient.email,
          subject: `SignalAI: ${event.title}`,
          html: `<p>${escapeHtml(event.title)}</p><p>${escapeHtml(event.message)}</p><p><a href="${link}">Open SignalAI</a></p>`,
        });
      }

      if (result.ok) {
        await pool.query(
          `update notification_deliveries
              set status = 'delivered', provider = $2, provider_message_id = $3,
                  last_error_code = null, delivered_at = now(), next_attempt_at = null, updated_at = now()
            where id = $1`,
          [delivery.id, result.provider, result.providerMessageId ?? null],
        );
        console.info(JSON.stringify({
          event: "notification.delivery",
          eventType: event?.event_type ?? "unknown",
          notificationId: delivery.event_id,
          workspaceId: delivery.tenant_id,
          channel: delivery.channel,
          provider: result.provider,
          attempt: delivery.attempts,
          result: "delivered",
        }));
        continue;
      }

      const errorCode = asSafeErrorCode(result.errorCode);
      const canRetry = result.failureClass === "retryable" && delivery.attempts < delivery.max_attempts;
      const nextAttemptAt = canRetry ? new Date(Date.now() + notificationRetryDelayMs(delivery.attempts)) : null;
      await pool.query(
        `update notification_deliveries
            set status = $2, last_error_code = $3, next_attempt_at = $4, updated_at = now()
          where id = $1`,
        [delivery.id, canRetry ? "retrying" : result.failureClass === "not_configured" ? "disabled" : "failed", errorCode, nextAttemptAt],
      );
      console[canRetry ? "warn" : "error"](JSON.stringify({
        event: "notification.delivery",
        eventType: event?.event_type ?? "unknown",
        notificationId: delivery.event_id,
        workspaceId: delivery.tenant_id,
        channel: delivery.channel,
        provider: result.provider,
        attempt: delivery.attempts,
        result: canRetry ? "retrying" : "failed",
        errorCode,
      }));

      // A periodic sweeper is the sole retry scheduler. It re-enqueues a row
      // only once it is due, and the worker atomically claims pending rows.
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

