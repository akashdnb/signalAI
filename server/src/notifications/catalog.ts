export type NotificationSeverity = "info" | "success" | "warning" | "critical";
export type NotificationChannel = "email" | "in_app";
export type NotificationEventType =
  | "lead.created"
  | "automation.execution_failed"
  | "automation.execution_recovered"
  | "instagram.connection_attention"
  | "instagram.connection_disconnected"
  | "system.operational_alert";

export interface NotificationEventDefinition {
  type: NotificationEventType;
  label: string;
  description: string;
  defaultSeverity: NotificationSeverity;
}

export const NOTIFICATION_EVENTS: readonly NotificationEventDefinition[] = [
  {
    type: "lead.created",
    label: "New leads",
    description: "A new lead is created from an Instagram conversation.",
    defaultSeverity: "info",
  },
  {
    type: "automation.execution_failed",
    label: "Automation failures",
    description: "A running automation fails and needs investigation.",
    defaultSeverity: "critical",
  },
  {
    type: "automation.execution_recovered",
    label: "Automation recovered",
    description: "An automation resumes after a recorded failure.",
    defaultSeverity: "success",
  },
  {
    type: "instagram.connection_attention",
    label: "Instagram connection needs attention",
    description: "A connected account has a permission, token, or webhook problem.",
    defaultSeverity: "warning",
  },
  {
    type: "instagram.connection_disconnected",
    label: "Instagram disconnected",
    description: "An Instagram account is no longer connected.",
    defaultSeverity: "critical",
  },
  {
    type: "system.operational_alert",
    label: "Important system alerts",
    description: "An important operational issue affects this workspace.",
    defaultSeverity: "critical",
  },
];

export const NOTIFICATION_CHANNELS: readonly {
  type: NotificationChannel;
  label: string;
  description: string;
}[] = [
  { type: "in_app", label: "In-app", description: "A notification in the SignalAI header inbox." },
  { type: "email", label: "Email", description: "An email sent to your sign-in address." },
];

export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return typeof value === "string" && NOTIFICATION_EVENTS.some((event) => event.type === value);
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return value === "email" || value === "in_app";
}
