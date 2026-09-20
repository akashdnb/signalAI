import type { Pool } from "pg";
import type { Queryable } from "./types.js";
import type { RawMediaMetadata } from "../lib/instagramMedia.js";

export interface KnownMedia {
  mediaId: string;
  commentCount: number;
  lastSeenAt: Date | null;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  postedAt: Date | null;
}

export async function upsertMediaMetadata(pool: Queryable, tenantId: string, metadata: RawMediaMetadata): Promise<void> {
  await pool.query(
    `insert into media_metadata (tenant_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (tenant_id, media_id) do update set
       caption = excluded.caption,
       media_type = excluded.media_type,
       thumbnail_url = excluded.thumbnail_url,
       permalink = excluded.permalink,
       posted_at = excluded.posted_at,
       fetched_at = now()`,
    [tenantId, metadata.mediaId, metadata.caption, metadata.mediaType, metadata.thumbnailUrl, metadata.permalink, metadata.postedAt],
  );
}

/**
 * Backs the campaign editor's post-targeting picker: every post this
 * tenant either (a) has actually received a comment on (derived from
 * ingested events, no Graph API call needed) or (b) has explicitly added
 * by URL (`media_metadata` with no matching comment yet) — unioned so
 * neither source hides the other. Caption/thumbnail/permalink come from
 * `media_metadata` when cached; a caller enriches whatever's missing
 * (see routes/campaigns.ts) rather than this query reaching out to Meta.
 */
export async function listKnownMediaForTenant(pool: Pool, tenantId: string): Promise<KnownMedia[]> {
  const result = await pool.query<{
    media_id: string;
    comment_count: string;
    last_seen_at: Date | null;
    caption: string | null;
    media_type: string | null;
    thumbnail_url: string | null;
    permalink: string | null;
    posted_at: Date | null;
  }>(
    `with media_ids as (
       select attributes->>'mediaId' as media_id from lead_events
       where tenant_id = $1 and event_type = 'comment' and attributes->>'mediaId' is not null
       union
       select media_id from media_metadata where tenant_id = $1
     ),
     counts as (
       select attributes->>'mediaId' as media_id, count(*)::bigint as comment_count, max(occurred_at) as last_seen_at
       from lead_events
       where tenant_id = $1 and event_type = 'comment' and attributes->>'mediaId' is not null
       group by attributes->>'mediaId'
     )
     select mi.media_id, coalesce(c.comment_count, 0) as comment_count, c.last_seen_at,
            m.caption, m.media_type, m.thumbnail_url, m.permalink, m.posted_at
     from media_ids mi
     left join counts c on c.media_id = mi.media_id
     left join media_metadata m on m.tenant_id = $1 and m.media_id = mi.media_id
     order by c.last_seen_at desc nulls last, m.posted_at desc nulls last`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    mediaId: row.media_id,
    commentCount: Number(row.comment_count),
    lastSeenAt: row.last_seen_at,
    caption: row.caption,
    mediaType: row.media_type,
    thumbnailUrl: row.thumbnail_url,
    permalink: row.permalink,
    postedAt: row.posted_at,
  }));
}
