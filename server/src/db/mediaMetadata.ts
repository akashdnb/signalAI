import type { Pool } from "pg";
import type { Queryable } from "./types.js";
import type { RawMediaMetadata } from "../lib/instagramMedia.js";

export interface KnownMedia {
  mediaId: string;
  instagramAccountId: string | null;
  commentCount: number;
  lastSeenAt: Date | null;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  postedAt: Date | null;
  fetchedAt: Date | null;
}

export async function upsertMediaMetadata(
  pool: Queryable,
  tenantId: string,
  metadata: RawMediaMetadata,
  instagramAccountId?: string,
): Promise<void> {
  if (instagramAccountId) {
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (tenant_id, instagram_account_id, media_id)
       where instagram_account_id is not null
       do update set
         caption = excluded.caption,
         media_type = excluded.media_type,
         thumbnail_url = excluded.thumbnail_url,
         permalink = excluded.permalink,
         posted_at = excluded.posted_at,
         fetched_at = now()`,
      [tenantId, instagramAccountId, metadata.mediaId, metadata.caption, metadata.mediaType, metadata.thumbnailUrl, metadata.permalink, metadata.postedAt],
    );
    return;
  }

  // Legacy callers such as the URL-based campaign picker do not yet know
  // which credential supplied the metadata. Keep those rows in the legacy
  // nullable-account bucket until a connected account resolves them.
  await pool.query(
    `insert into media_metadata (tenant_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (tenant_id, media_id)
     where instagram_account_id is null
     do update set
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
 * the most recently fetched account-scoped metadata row.
 */
export async function listKnownMediaForTenant(pool: Pool, tenantId: string): Promise<KnownMedia[]> {
  const result = await pool.query<{
    media_id: string;
    instagram_account_id: string | null;
    comment_count: string;
    last_seen_at: Date | null;
    caption: string | null;
    media_type: string | null;
    thumbnail_url: string | null;
    permalink: string | null;
    posted_at: Date | null;
    fetched_at: Date | null;
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
     select mi.media_id, m.instagram_account_id,
            coalesce(c.comment_count, 0) as comment_count, c.last_seen_at,
            m.caption, m.media_type, m.thumbnail_url, m.permalink, m.posted_at, m.fetched_at
     from media_ids mi
     left join counts c on c.media_id = mi.media_id
     left join lateral (
       select instagram_account_id, caption, media_type, thumbnail_url, permalink, posted_at, fetched_at
       from media_metadata
       where tenant_id = $1 and media_id = mi.media_id
       order by fetched_at desc nulls last, id desc
       limit 1
     ) m on true
     order by c.last_seen_at desc nulls last, m.posted_at desc nulls last`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    mediaId: row.media_id,
    instagramAccountId: row.instagram_account_id,
    commentCount: Number(row.comment_count),
    lastSeenAt: row.last_seen_at,
    caption: row.caption,
    mediaType: row.media_type,
    thumbnailUrl: row.thumbnail_url,
    permalink: row.permalink,
    postedAt: row.posted_at,
    fetchedAt: row.fetched_at,
  }));
}
