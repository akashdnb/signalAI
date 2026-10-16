import type { Request } from "express";
import type { NotificationEventType } from "./catalog.js";

/** Keeps recipient selection server-owned and scoped to a tenant membership row. */
export function notificationTenantId(req: Request): string {
  return req.params.tenantId!;
}

export function notificationActorId(req: Request): string {
  return req.tenantSession!.userId;
}

export function supportedEventType(value: unknown): value is NotificationEventType {
  return typeof value === "string" && [
    "lead.created",
    "automation.execution_failed",
    "automation.execution_recovered",
    "instagram.connection_attention",
    "instagram.connection_disconnected",
    "system.operational_alert",
  ].includes(value);
}
