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
  instagramUserId: string; // the commenter/sender for an inbound event — for an echo (isEcho: true), the RECIPIENT instead, since that's the actual lead
  metaEventId: string; // idempotency key
  eventType: "comment" | "message";
  occurredAt: Date;
  commentText?: string;
  dmText?: string;
  username?: string;
  mediaId?: string; // the post/Reel the comment was left on — absent for message events
  commentId?: string; // Meta's own comment id — needed to post a public reply to this exact comment
  /** Only set (true) for eventType 'message': Meta's echo of an outbound DM sent from the connected account — by the bot, or by a human agent replying directly in Instagram. Routed to webhookIngestService.ts's separate echo-ingestion path, never through keyword matching/campaign triggers. */
  isEcho?: boolean;
  /** Only set alongside isEcho: the mid this echo reports — the same id Meta's Send API returned when the message was actually sent, used to correlate an echo back to a send this system already recorded (see db/sentReplies.ts's sentReplyExistsForMetaMessageId). */
  metaMessageId?: string;
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

        const media = isRecord(value.media) ? value.media : {};
        const mediaId = typeof media.id === "string" ? media.id : undefined;

        events.push({
          instagramAccountId,
          instagramUserId,
          metaEventId: `comment:${commentId}`,
          eventType: "comment",
          occurredAt: entryTime,
          commentText: typeof value.text === "string" ? value.text : undefined,
          username: typeof from.username === "string" ? from.username : undefined,
          mediaId,
          commentId,
        });
      }
    }

    if (Array.isArray(entry.messaging)) {
      for (const item of entry.messaging) {
        if (!isRecord(item)) continue;
        const sender = isRecord(item.sender) ? item.sender : {};
        const message = isRecord(item.message) ? item.message : {};

        const senderId = typeof sender.id === "string" ? sender.id : undefined;
        const messageId = typeof message.mid === "string" ? message.mid : undefined;
        if (!senderId || !messageId) continue;

        const timestamp = typeof item.timestamp === "number" ? new Date(item.timestamp) : entryTime;
        const dmText = typeof message.text === "string" ? message.text : describeAttachments(message);

        // Meta echoes the business's OWN outbound DMs back as messaging
        // events, sender-is-the-account (a message *from* the connected
        // account is by definition outbound) as the structural backstop
        // for is_echo, which is the documented flag but not guaranteed
        // present. Naively treating `senderId` as the lead here — as this
        // parser used to for every messaging event, echoes included —
        // creates a "lead" whose instagram_user_id is the business account
        // itself and opens a 24h messaging window against ourselves:
        // observed live, sending one reply produced a second lead for
        // account 17841408728501893. An echo instead uses the RECIPIENT as
        // the lead (the actual customer this was sent to), which is also
        // who the send was addressed to in the first place.
        if (message.is_echo === true || senderId === instagramAccountId) {
          const recipient = isRecord(item.recipient) ? item.recipient : {};
          const recipientId = typeof recipient.id === "string" ? recipient.id : undefined;
          if (!recipientId) continue; // can't attribute this echo to any lead

          events.push({
            instagramAccountId,
            instagramUserId: recipientId,
            metaEventId: `message:${messageId}`,
            eventType: "message",
            occurredAt: timestamp,
            dmText,
            isEcho: true,
            metaMessageId: messageId,
          });
          continue;
        }

        events.push({
          instagramAccountId,
          instagramUserId: senderId,
          metaEventId: `message:${messageId}`,
          eventType: "message",
          occurredAt: timestamp,
          dmText,
        });
      }
    }
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A shared Reel/post, photo, video, voice clip, or story mention arrives
 * with no `message.text` at all — only `message.attachments` — so without
 * this, dmText stayed undefined and the message rendered as a blank DM in
 * the timeline (lead_pii.dm_text null, "—" is LeadDetailPage.tsx's fallback
 * for missing text). A short, readable label plus the content's own URL
 * (when Meta includes one) beats a blank row; VERIFY the exact attachment
 * `type`/`payload` shape against a real payload, same caveat as this file's
 * top-level docstring — unrecognized types fall back to a generic label
 * rather than staying blank.
 */
function describeAttachments(message: Record<string, unknown>): string | undefined {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = attachments[0];
  if (!isRecord(first)) return undefined;

  const type = typeof first.type === "string" ? first.type : undefined;
  const payload = isRecord(first.payload) ? first.payload : {};
  const url = typeof payload.url === "string" ? payload.url : undefined;

  const label =
    type === "share" || type === "media_share" || type === "reel"
      ? "Shared a reel/post"
      : type === "story_mention"
        ? "Mentioned you in their story"
        : type === "image"
          ? "Sent a photo"
          : type === "video"
            ? "Sent a video"
            : type === "audio"
              ? "Sent a voice clip"
              : "Shared content";

  return url ? `${label}: ${url}` : label;
}
