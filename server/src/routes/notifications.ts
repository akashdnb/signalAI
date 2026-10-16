import { Router } from "express";
import { getPool } from "../db/pool.js";
import { getUserById } from "../db/users.js";
import { requireTenantRole } from "../lib/tenantAuth.js";
import { config } from "../config.js";
import { isNotificationChannel, isNotificationEventType, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from "../notifications/catalog.js";

export const notificationsRouter = Router();

function channelAvailability(channel: "email" | "in_app") {
  if (channel === "in_app") return { available: true, reason: null };
  if (!config.resendApiKey) return { available: false, reason: "Email delivery is not configured on this SignalAI server." };
  return { available: true, reason: null };
}

notificationsRouter.get(
  "/tenants/:tenantId/notifications/preferences",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const pool = getPool();
    const tenantId = req.params.tenantId!;
    const userId = req.tenantSession!.userId;
    const user = await getUserById(pool, userId);
    if (!user) return res.status(401).json({ error: "user not found" });
    const result = await pool.query<{ event_type: string; channel: "email" | "in_app"; enabled: boolean }>(
      "select event_type, channel, enabled from notification_preferences where tenant_id = $1 and user_id = $2",
      [tenantId, userId],
    );
    const saved = new Map(result.rows.map((row) => [`${row.event_type}:${row.channel}`, row.enabled]));
    return res.json({
      events: NOTIFICATION_EVENTS.map((event) => ({
        type: event.type,
        label: event.label,
        description: event.description,
        severity: event.defaultSeverity,
        channels: NOTIFICATION_CHANNELS.map((channel) => ({
          type: channel.type,
          label: channel.label,
          description: channel.description,
          ...channelAvailability(channel.type),
          enabled: channel.type === "in_app"
            ? saved.get(`${event.type}:in_app`) ?? true
            : saved.get(`${event.type}:email`) ?? false,
        })),
      })),
      recipient: { email: user.email },
    });
  },
);

notificationsRouter.put(
  "/tenants/:tenantId/notifications/preferences",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const body = req.body as { preferences?: unknown } | undefined;
    if (!body || !Array.isArray(body.preferences) || body.preferences.length === 0 || body.preferences.length > 24) {
      return res.status(400).json({ error: "preferences must be a non-empty array with at most 24 entries" });
    }

    const seen = new Set<string>();
    for (const item of body.preferences) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return res.status(400).json({ error: "each preference must be an object" });
      }
      const preference = item as Record<string, unknown>;
      if (Object.keys(preference).some((key) => !["eventType", "channel", "enabled"].includes(key))) {
        return res.status(400).json({ error: "unsupported preference fields" });
      }
      if (!isNotificationEventType(preference.eventType) || !isNotificationChannel(preference.channel) || typeof preference.enabled !== "boolean") {
        return res.status(400).json({ error: "unsupported event/channel or invalid enabled value" });
      }
      const key = `${preference.eventType}:${preference.channel}`;
      if (seen.has(key)) return res.status(400).json({ error: "duplicate preference" });
      seen.add(key);
      if (preference.channel === "email" && !config.resendApiKey && preference.enabled) {
        return res.status(409).json({ error: "email delivery is unavailable because the provider is not configured" });
      }
    }

    const pool = getPool();
    const tenantId = req.params.tenantId!;
    const userId = req.tenantSession!.userId;
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const item of body.preferences as Array<{ eventType: string; channel: "email" | "in_app"; enabled: boolean }>) {
        await client.query(
          `insert into notification_preferences (tenant_id, user_id, event_type, channel, enabled, updated_at)
           values ($1,$2,$3,$4,$5,now())
           on conflict (tenant_id,user_id,event_type,channel)
           do update set enabled = excluded.enabled, updated_at = now()`,
          [tenantId, userId, item.eventType, item.channel, item.enabled],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return res.json({ saved: true, updatedCount: seen.size });
  },
);

notificationsRouter.get(
  "/tenants/:tenantId/notifications",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: "limit must be an integer between 1 and 50" });
    }
    const result = await getPool().query<{
      id: string; event_type: string; title: string; message: string; severity: string;
      entity_type: string | null; entity_id: string | null; read_at: Date | null; created_at: Date;
    }>(
      `select id,event_type,title,message,severity,entity_type,entity_id,read_at,created_at
         from notifications
        where tenant_id = $1 and user_id = $2
        order by created_at desc, id desc
        limit $3`,
      [req.params.tenantId, req.tenantSession!.userId, limit],
    );
    const unreadCount = await getPool().query<{ count: number }>(
      "select count(*)::int as count from notifications where tenant_id = $1 and user_id = $2 and read_at is null",
      [req.params.tenantId, req.tenantSession!.userId],
    );
    return res.json({
      notifications: result.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        title: row.title,
        message: row.message,
        severity: row.severity,
        entityType: row.entity_type,
        entityId: row.entity_id,
        readAt: row.read_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
      })),
      unreadCount: unreadCount.rows[0]?.count ?? 0,
    });
  },
);

notificationsRouter.patch(
  "/tenants/:tenantId/notifications/:notificationId/read",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const result = await getPool().query(
      `update notifications set read_at = now()
        where id = $1 and tenant_id = $2 and user_id = $3 and read_at is null
        returning id`,
      [req.params.notificationId, req.params.tenantId, req.tenantSession!.userId],
    );
    if (!result.rowCount) {
      const existing = await getPool().query(
        "select 1 from notifications where id = $1 and tenant_id = $2 and user_id = $3",
        [req.params.notificationId, req.params.tenantId, req.tenantSession!.userId],
      );
      if (!existing.rowCount) return res.status(404).json({ error: "notification not found" });
    }
    return res.json({ read: true });
  },
);

notificationsRouter.post(
  "/tenants/:tenantId/notifications/read-all",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const result = await getPool().query(
      "update notifications set read_at = now() where tenant_id = $1 and user_id = $2 and read_at is null",
      [req.params.tenantId, req.tenantSession!.userId],
    );
    return res.json({ read: true, updatedCount: result.rowCount ?? 0 });
  },
);
