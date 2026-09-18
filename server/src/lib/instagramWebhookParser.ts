/**
 * Normalizes Meta's Instagram webhook envelope (entry[] -> changes[] for
 * comments, entry[] -> messaging[] for DMs) into flat events this system
 * can persist. Field names here are based on Meta's published webhook
 * shape, not a live payload — VERIFY against a real payload during Phase 0
 * pilot testing (A6) before relying on this in production; a mismatch here
 * fails safe (an event is skipped, logged, not silently misattributed) but
 * still needs a real check.
 *
 * A single POST can batch updates across multiple entries — always iterate
 * entry[], never assume one event per request.
 */

export interface ParsedWebhookEvent {
  instagramAccountId: string; // the creator's connected professional account
  instagramUserId: string; // the commenter/sender — becomes the lead
  metaEventId: string; // idempotency key
  eventType: "comment" | "message";
  occurredAt: Date;
  commentText?: string;
  dmText?: string;
  username?: string;
}

export function parseInstagramWebhookPayload(payload: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];
  const entries = isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const instagramAccountId = typeof entry.id === "string" ? entry.id : undefined;
    if (!instagramAccountId) continue;

    const entryTime = typeof entry.time === "number" ? new Date(entry.time * 1000) : new Date();

    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (!isRecord(change) || change.field !== "comments") continue;
        const value = change.value;
        if (!isRecord(value)) continue;

        const from = isRecord(value.from) ? value.from : {};
        const instagramUserId = typeof from.id === "string" ? from.id : undefined;
        const commentId = typeof value.id === "string" ? value.id : undefined;
        if (!instagramUserId || !commentId) continue;

        events.push({
          instagramAccountId,
          instagramUserId,
          metaEventId: `comment:${commentId}`,
          eventType: "comment",
          occurredAt: entryTime,
          commentText: typeof value.text === "string" ? value.text : undefined,
          username: typeof from.username === "string" ? from.username : undefined,
        });
      }
    }

    if (Array.isArray(entry.messaging)) {
      for (const item of entry.messaging) {
        if (!isRecord(item)) continue;
        const sender = isRecord(item.sender) ? item.sender : {};
        const message = isRecord(item.message) ? item.message : {};

        const instagramUserId = typeof sender.id === "string" ? sender.id : undefined;
        const messageId = typeof message.mid === "string" ? message.mid : undefined;
        if (!instagramUserId || !messageId) continue;

        const timestamp = typeof item.timestamp === "number" ? new Date(item.timestamp) : entryTime;

        events.push({
          instagramAccountId,
          instagramUserId,
          metaEventId: `message:${messageId}`,
          eventType: "message",
          occurredAt: timestamp,
          dmText: typeof message.text === "string" ? message.text : undefined,
        });
      }
    }
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
