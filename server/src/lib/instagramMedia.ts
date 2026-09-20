/**
 * Reads media metadata for the connected account — distinct from
 * instagramSend.ts (which sends) and instagramWebhookParser.ts (which
 * parses inbound events). Backs the campaign editor's post-targeting
 * picker: a thumbnail/caption/permalink instead of a bare media id, and
 * resolving a pasted post URL to the media id Meta's webhooks actually use.
 *
 * Requires `instagram_business_basic`, already requested in the OAuth
 * scope (instagramOAuth.ts) — not exercised against a live app yet, same
 * "VERIFY during Phase 0 pilot testing" caveat as the rest of this
 * directory's Graph API integrations.
 */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const FETCH_TIMEOUT_MS = 8000;
const MEDIA_FIELDS = "caption,media_type,thumbnail_url,permalink,timestamp";
// A creator's own media list, worst case — bounds a synchronous
// user-initiated "add by URL" request to a fixed number of round trips
// rather than paging through years of posts.
const MAX_PAGES_SEARCHED = 10;
const PAGE_SIZE = 50;

export interface RawMediaMetadata {
  mediaId: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  postedAt: Date | null;
}

interface MediaApiItem {
  id: string;
  caption?: string;
  media_type?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

function toRawMetadata(item: MediaApiItem): RawMediaMetadata {
  return {
    mediaId: item.id,
    caption: item.caption ?? null,
    mediaType: item.media_type ?? null,
    thumbnailUrl: item.thumbnail_url ?? null,
    permalink: item.permalink ?? null,
    postedAt: item.timestamp ? new Date(item.timestamp) : null,
  };
}

async function graphGet<T>(url: string, accessToken?: string): Promise<T> {
  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram media API failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** For enriching a post already known by media id (observed via a comment) — one media at a time, called lazily when the picker is read and the cache is missing an entry. */
export async function fetchMediaMetadata(accessToken: string, mediaId: string): Promise<RawMediaMetadata> {
  const url = `${GRAPH_BASE_URL}/v21.0/${encodeURIComponent(mediaId)}?fields=${MEDIA_FIELDS}`;
  const item = await graphGet<MediaApiItem & { id: string }>(url, accessToken);
  return toRawMetadata(item);
}

/**
 * A pasted Instagram post/Reel URL uses a shortcode, not the numeric media
 * id Meta's webhooks and this Graph API use elsewhere — there is no direct
 * shortcode-to-media-id lookup, so resolving one means paging through the
 * connected account's own media (`GET /{ig-user-id}/media`) until a
 * permalink matches. Only ever searches the CALLING account's own media,
 * which is also the correct scoping: a campaign can only target its own
 * creator's posts. Matches by shortcode (the `/p/<code>/`, `/reel/<code>/`
 * segment) rather than a raw string compare, so query params, a missing
 * `www.`, or `/reel/` vs `/p/` in what the user pasted doesn't matter.
 */
export async function findMediaByPermalink(
  accessToken: string,
  instagramAccountId: string,
  pastedUrl: string,
): Promise<RawMediaMetadata | null> {
  const targetShortcode = extractShortcode(pastedUrl);
  if (!targetShortcode) return null;

  let url: string | null =
    `${GRAPH_BASE_URL}/v21.0/${encodeURIComponent(instagramAccountId)}/media?fields=id,${MEDIA_FIELDS}&limit=${PAGE_SIZE}`;

  for (let page = 0; url && page < MAX_PAGES_SEARCHED; page++) {
    const response: { data: MediaApiItem[]; paging?: { next?: string } } = await graphGet(url, accessToken);
    const match = response.data.find((item) => item.permalink && extractShortcode(item.permalink) === targetShortcode);
    if (match) return toRawMetadata(match);
    url = response.paging?.next ?? null;
  }

  return null;
}

function extractShortcode(url: string): string | null {
  const match = url.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1]! : null;
}
