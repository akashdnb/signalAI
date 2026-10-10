export interface InstagramInteraction {
  type: "quick_reply" | "postback";
  payload: string;
  title: string | null;
}

export interface InstagramInboundMessage {
  providerEventId: string;
  /** The connected professional account receiving the message. */
  instagramAccountId: string;
  /** The Instagram user who sent the message; this becomes journey subject_key. */
  instagramUserId: string;
  eventType: "message";
  messageText: string | null;
  eventAt: Date | null;
  /** Parsed interaction metadata. The raw envelope is still persisted for audit/debugging. */
  interaction?: InstagramInteraction;
  raw: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Extract a signed-by-Meta interaction from a raw messaging event. Never infer one from message text. */
export function readInstagramInteraction(raw: unknown): InstagramInteraction | undefined {
  const event = record(raw);
  if (!event) return undefined;

  const postback = record(event.postback);
  const postbackPayload = stringValue(postback?.payload);
  if (postbackPayload) {
    return {
      type: "postback",
      payload: postbackPayload,
      title: stringValue(postback?.title),
    };
  }

  const message = record(event.message);
  const quickReply = record(message?.quick_reply);
  const quickReplyPayload = stringValue(quickReply?.payload);
  if (quickReplyPayload) {
    return {
      type: "quick_reply",
      payload: quickReplyPayload,
      title: stringValue(quickReply?.title) ?? stringValue(message?.text),
    };
  }

  return undefined;
}

export function parseInstagramWebhook(payload: unknown): InstagramInboundMessage[] {
  const root = record(payload);
  if (!root) return [];

  const entries = Array.isArray(root.entry) ? root.entry : [];
  const events: InstagramInboundMessage[] = [];

  for (const entryValue of entries) {
    const entry = record(entryValue);
    if (!entry) continue;

    const entryAccountId = stringValue(entry.id);
    if (!entryAccountId) continue;

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const value of messaging) {
      const event = record(value);
      if (!event) continue;

      const sender = record(event.sender);
      const recipient = record(event.recipient);
      const message = record(event.message);
      const postback = record(event.postback);
      const senderId = stringValue(sender?.id);
      const recipientId = stringValue(recipient?.id);
      if (!senderId || !recipientId || (!message && !postback)) continue;

      const interaction = readInstagramInteraction(event);
      const messageId = stringValue(message?.mid) ?? stringValue(event.message_id);
      const timestampValue = typeof event.timestamp === "number" ? event.timestamp : null;

      // Most message events have a Meta message id. Postback notifications may
      // omit one, so derive a deterministic id from the signed webhook fields
      // rather than dropping a valid user interaction.
      const providerEventId = messageId ?? (
        interaction?.type === "postback"
          ? `postback:${senderId}:${recipientId}:${timestampValue ?? "unknown"}:${interaction.payload}`
          : null
      );
      if (!providerEventId) continue;

      const messageText =
        stringValue(message?.text) ??
        interaction?.title ??
        (interaction?.type === "postback" ? interaction.payload : null);

      events.push({
        providerEventId,
        instagramAccountId: recipientId || entryAccountId,
        instagramUserId: senderId,
        eventType: "message",
        messageText,
        eventAt: timestampValue === null ? null : new Date(timestampValue),
        ...(interaction ? { interaction } : {}),
        raw: event,
      });
    }
  }

  return events;
}
