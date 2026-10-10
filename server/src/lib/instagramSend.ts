import {
  buildInstagramMessagePayload,
  type InstagramRichMessageOptions,
} from "./instagramMessagePayload.js";

/** Sends DMs via Instagram's Send API. */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const SEND_TIMEOUT_MS = 8000;

export interface SendInstagramMessageResult {
  /** Meta's own id for this send (Send API response's `message_id`). */
  metaMessageId: string | null;
}

export async function sendInstagramMessage(
  accessToken: string,
  recipientInstagramUserId: string,
  text: string,
  richMessage?: InstagramRichMessageOptions,
): Promise<SendInstagramMessageResult> {
  // Keep the token in the Authorization header rather than the URL so it
  // doesn't appear in request-line logs, proxies, or APM traces.
  const url = `${GRAPH_BASE_URL}/v21.0/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientInstagramUserId },
      message: buildInstagramMessagePayload(text, richMessage),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Instagram send failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }

  const body = (await res.json()) as { message_id?: string };
  return { metaMessageId: typeof body.message_id === "string" ? body.message_id : null };
}

/**
 * Posts a PUBLIC reply under a comment (Meta's `POST /{ig-comment-id}/replies`).
 */
export async function sendInstagramCommentReply(
  accessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const url = `${GRAPH_BASE_URL}/v21.0/${encodeURIComponent(commentId)}/replies`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message: text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Instagram comment reply failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }
}
