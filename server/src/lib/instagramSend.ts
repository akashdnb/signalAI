/**
 * Sends a DM via Instagram's messaging API. Field names follow Meta's
 * published Send API shape (shared with Messenger), not exercised against
 * a live app yet — VERIFY against a real payload during Phase 0 pilot
 * testing (A6), same caveat as instagramWebhookParser.ts.
 */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const SEND_TIMEOUT_MS = 8000;

export interface SendInstagramMessageResult {
  /** Meta's own id for this send (Send API response's `message_id` — same value Meta's echo webhook later reports as the message's `mid`) — VERIFY the field name against a real payload, same caveat as instagramWebhookParser.ts. Used to correlate our own echo back to this send, so it isn't mistaken for a human reply (see webhookIngestService.ts). Null if the response didn't include one. */
  metaMessageId: string | null;
}

export async function sendInstagramMessage(
  accessToken: string,
  recipientInstagramUserId: string,
  text: string,
): Promise<SendInstagramMessageResult> {
  // R6-04 fix: the token used to travel as an `access_token` URL query
  // param — request URLs are the most-logged string in any stack (process
  // logs, proxies, APM traces, error messages that echo the request line),
  // so the one secret B2 went to the trouble of envelope-encrypting at
  // rest was traveling in the one place everything writes down. Meta
  // accepts it as a Bearer token too.
  const url = `${GRAPH_BASE_URL}/v21.0/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientInstagramUserId },
      message: { text },
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
 * Posts a PUBLIC reply under a comment (Meta's `POST /{ig-comment-id}/replies`)
 * — distinct from `sendInstagramMessage` above, which sends a private DM.
 * This is what campaigns.reply_channel 'comment'/'both' actually deliver on;
 * `guardrails.ts`'s comment-tier length cap already assumes this reply is
 * visible to everyone, not just the commenter.
 *
 * Requires `instagram_business_manage_comments`, already requested
 * alongside `instagram_business_basic`/`instagram_business_manage_messages`
 * in the OAuth scope (instagramOAuth.ts) — but a scope being requested
 * isn't the same as Meta having approved it for this app in production
 * (App Review, Phase 0). VERIFY the field/endpoint shape against a real
 * payload and confirm the permission is actually granted during Phase 0
 * pilot testing (A6), same caveat as instagramWebhookParser.ts, before
 * enabling reply_channel 'comment'/'both' for a real tenant.
 */
export async function sendInstagramCommentReply(accessToken: string, commentId: string, text: string): Promise<void> {
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
