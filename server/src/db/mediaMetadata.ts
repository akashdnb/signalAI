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
  refreshRetryAt: Date | null;
  refreshFailureCount: number;
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
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          refresh_failure_count, refresh_retry_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 0, null)
       on conflict (tenant_id, instagram_account_id, media_id)
       where instagram_account_id is not null
       do update set
         caption = excluded.caption,
         media_type = excluded.media_type,
         thumbnail_url = excluded.thumbnail_url,
         permalink = excluded.permalink,
         posted_at = excluded.posted_at,
         fetched_at = now(),
         refresh_failure_count = 0,
         refresh_retry_at = null`,
      [
        tenantId,
        instagramAccountId,
        metadata.mediaId,
        metadata.caption,
        metadata.mediaType,
        metadata.thumbnailUrl,
        metadata.permalink,
        metadata.postedAt,
      ],
    );
  } else {
    // Legacy callers such as the URL-based campaign picker do not yet know
    // which credential supplied the metadata. Keep those rows in the legacy
    // nullable-account bucket until a connected account resolves them.
    await pool.query(
      `insert into media_metadata
         (tenant_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          refresh_failure_count, refresh_retry_at)
       values ($1, $2, $3, $4, $5, $6, $7, 0, null)
       on conflict (tenant_id, media_id)
       where instagram_account_id is null
       do update set
         caption = excluded.caption,
         media_type = excluded.media_type,
         thumbnail_url = excluded.thumbnail_url,
         permalink = excluded.permalink,
         posted_at = excluded.posted_at,
         fetched_at = now(),
         refresh_failure_count = 0,
         refresh_retry_at = null`,
      [
        tenantId,
        metadata.mediaId,
        metadata.caption,
        metadata.mediaType,
        metadata.thumbnailUrl,
        metadata.permalink,
        metadata.postedAt,
      ],
    );
  }

  // Retry state is a property of the media item, not of whichever account
  // row happened to resolve it. A successful refresh therefore clears the
  // shared retry state on every row for this tenant/media pair.
  await pool.query(
    `update media_metadata
        set refresh_failure_count = 0,
            refresh_retry_at = null
      where tenant_id = $1 and media_id = $2`,
    [tenantId, metadata.mediaId],
  );
}

/**
 * Record a failed enrichment without touching `fetched_at` or any cached
 * presentation fields. Retry state is normalized across every account-scoped
 * and legacy row for the media item so the next request cannot depend on
 * which metadata row wins the presentation ordering.
 */
export async function recordMediaMetadataRefreshFailure(
  pool: Queryable,
  tenantId: string,
  mediaId: string,
  retryAt: Date,
  instagramAccountId?: string,
): Promise<void> {
  if (instagramAccountId) {
    const result = await pool.query(
      `update media_metadata
          set refresh_failure_count = least(coalesce(refresh_failure_count, 0) + 1, 3),
              refresh_retry_at = $4
        where tenant_id = $1 and media_id = $2 and instagram_account_id = $3`,
      [tenantId, mediaId, instagramAccountId, retryAt],
    );

    if ((result.rowCount ?? 0) > 0) return;

    // Keep a selected account's retry record in its own metadata bucket,
    // rather than marking other accounts' cache rows for the same media ID.
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, fetched_at, refresh_failure_count, refresh_retry_at)
       values ($1, $2, $3, null, 1, $4)
       on conflict (tenant_id, instagram_account_id, media_id)
       where instagram_account_id is not null
       do update set
         refresh_failure_count = least(media_metadata.refresh_failure_count + 1, 3),
         refresh_retry_at = excluded.refresh_retry_at`,
      [tenantId, instagramAccountId, mediaId, retryAt],
    );
    return;
  }

  // Workspace-wide requests retain aggregate, media-level retry state.
  const result = await pool.query(
    `update media_metadata m
        set refresh_failure_count = least(
              (
                select coalesce(max(refresh_failure_count), 0) + 1
                from media_metadata
                where tenant_id = $1 and media_id = $2
              ),
              3
            ),
            refresh_retry_at = $3
      where m.tenant_id = $1 and m.media_id = $2`,
    [tenantId, mediaId, retryAt],
  );

  if ((result.rowCount ?? 0) > 0) return;

  await pool.query(
    `insert into media_metadata
       (tenant_id, media_id, fetched_at, refresh_failure_count, refresh_retry_at)
     values ($1, $2, null, 1, $3)
     on conflict (tenant_id, media_id)
     where instagram_account_id is null
     do update set
       refresh_failure_count = least(media_metadata.refresh_failure_count + 1, 3),
       refresh_retry_at = excluded.refresh_retry_at`,
    [tenantId, mediaId, retryAt],
  );
}

/**
 * Backs the campaign editor's post-targeting picker: every post this
 * tenant either (a) has actually received a comment on (derived from
 * ingested events, no Graph API call needed) or (b) has explicitly added
 * by URL (`media_metadata` with no matching comment yet) — unioned so
 * neither source hides the other. Caption/thumbnail/permalink come from
 * the most recently fetched account-scoped metadata row. Retry state is
 * aggregated separately at the media-item level.
 */
export async function listKnownMediaForTenant(
  pool: Pool,
  tenantId: string,
  instagramAccountId?: string,
): Promise<KnownMedia[]> {
  // An account-selected product view must scope identifiers, counts and
  // metadata in SQL. Filtering the one-row-per-media workspace response in
  // the browser would miss media seen by more than one connected account.
  const eventAccountFilter = instagramAccountId
    ? "and coalesce(e.attributes->>'instagramAccountId', l.instagram_account_id) = $2"
    : "";
  const mediaAccountFilter = instagramAccountId
    ? "and instagram_account_id = $2"
    : "";
  const params = instagramAccountId ? [tenantId, instagramAccountId] : [tenantId];
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
    refresh_retry_at: Date | null;
    refresh_failure_count: number;
  }>(
    `with media_ids as (
       select e.attributes->>'mediaId' as media_id
         from lead_events e
         left join leads l on l.tenant_id = e.tenant_id and l.id = e.lead_id
        where e.tenant_id = $1
          and e.event_type = 'comment'
          and e.attributes->>'mediaId' is not null
          ${eventAccountFilter}
       union
       select media_id from media_metadata
        where tenant_id = $1 ${mediaAccountFilter}
     ),
     counts as (
       select e.attributes->>'mediaId' as media_id,
              count(*)::bigint as comment_count,
              max(e.occurred_at) as last_seen_at
         from lead_events e
         left join leads l on l.tenant_id = e.tenant_id and l.id = e.lead_id
        where e.tenant_id = $1
          and e.event_type = 'comment'
          and e.attributes->>'mediaId' is not null
          ${eventAccountFilter}
        group by e.attributes->>'mediaId'
     ),
     refresh_state as (
       select media_id,
              least(max(refresh_failure_count), 3) as refresh_failure_count,
              max(refresh_retry_at) as refresh_retry_at
         from media_metadata
        where tenant_id = $1 ${mediaAccountFilter}
        group by media_id
     )
     select mi.media_id, m.instagram_account_id,
            coalesce(c.comment_count, 0) as comment_count, c.last_seen_at,
            m.caption, m.media_type, m.thumbnail_url, m.permalink, m.posted_at, m.fetched_at,
            rs.refresh_retry_at, coalesce(rs.refresh_failure_count, 0) as refresh_failure_count
       from media_ids mi
       left join counts c on c.media_id = mi.media_id
       left join lateral (
         select instagram_account_id, caption, media_type, thumbnail_url, permalink, posted_at, fetched_at
           from media_metadata
          where tenant_id = $1 and media_id = mi.media_id ${mediaAccountFilter}
          order by fetched_at desc nulls last, id desc
          limit 1
       ) m on true
       left join refresh_state rs on rs.media_id = mi.media_id
      order by c.last_seen_at desc nulls last, m.posted_at desc nulls last`,
    params,
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
    refreshRetryAt: row.refresh_retry_at,
    refreshFailureCount: Number(row.refresh_failure_count),
  }));
}
