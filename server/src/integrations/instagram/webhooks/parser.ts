export interface InstagramInboundMessage {
  providerEventId: string;

  /*
   * The Instagram account receiving the message.
   * This is used for tenant/account resolution.
   */
  instagramAccountId: string;

  /*
   * The person sending the message.
   * This becomes journey subject_key.
   */
  instagramUserId: string;

  eventType: "message";

  messageText: string | null;

  eventAt: Date | null;

  raw: Record<string, unknown>;
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.length > 0
    ? value
    : null;
}

export function parseInstagramWebhook(
  payload: unknown,
): InstagramInboundMessage[] {
  const root = record(payload);

  if (!root) {
    return [];
  }

  const entries = Array.isArray(root.entry)
    ? root.entry
    : [];

  const events: InstagramInboundMessage[] = [];

  for (const entryValue of entries) {
    const entry = record(entryValue);

    if (!entry) {
      continue;
    }

    const entryAccountId =
      stringValue(entry.id);

    if (!entryAccountId) {
      continue;
    }

    const messaging = Array.isArray(entry.messaging)
      ? entry.messaging
      : [];

    for (const value of messaging) {
      const event = record(value);

      if (!event) {
        continue;
      }

      const sender = record(event.sender);
      const recipient = record(event.recipient);
      const message = record(event.message);

      const senderId =
        stringValue(sender?.id);

      const recipientId =
        stringValue(recipient?.id);

      if (!senderId || !recipientId || !message) {
        continue;
      }

      const providerEventId =
        stringValue(message.mid) ??
        stringValue(event.message_id);

      if (!providerEventId) {
        continue;
      }

      const messageText =
        stringValue(message.text);

      const timestamp =
        typeof event.timestamp === "number"
          ? new Date(event.timestamp)
          : null;

      events.push({
        providerEventId,
        instagramAccountId: recipientId,
        instagramUserId: senderId,
        eventType: "message",
        messageText,
        eventAt: timestamp,
        raw: event,
      });
    }
  }

  return events;
}
