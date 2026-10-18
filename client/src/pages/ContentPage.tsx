import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type ObservedMedia } from "../api";
import { PlayIcon } from "../components/icons";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { useTenant } from "../context/TenantContext";

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
};

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All media" },
  { value: "IMAGE", label: "Image" },
  { value: "CAROUSEL_ALBUM", label: "Carousel" },
  { value: "VIDEO", label: "Video" },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffDay = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDay < 1) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatSyncStatus(item: ObservedMedia): string {
  const fetchedAt = (item as ObservedMedia & { fetchedAt?: string | null }).fetchedAt ?? null;
  if (!fetchedAt) return "Sync pending";
  return `Synced ${formatRelative(fetchedAt)}`;
}

function mediaPreviewLabel(mediaType: string | null): string {
  if (mediaType === "VIDEO") return "Video preview";
  if (mediaType === "CAROUSEL_ALBUM") return "Carousel preview";
  return "Post preview";
}

export function ContentPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { selectedAccountId } = useTenant();

  const [media, setMedia] = useState<ObservedMedia[] | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [previewMedia, setPreviewMedia] = useState<ObservedMedia | null>(null);
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setMedia(null);
    setError(null);
    setPreviewMedia(null);
    api
      .listObservedMedia(tenantId, selectedAccountId)
      .then((items) => {
        if (cancelled) return;
        setMedia(items);
        setFailedPreviews(new Set());
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load content");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate, reloadCount, selectedAccountId]);

  useEffect(() => {
    if (!previewMedia) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewMedia(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewMedia]);

  const filteredMedia = useMemo(() => {
    if (media === null) return [];
    const query = search.trim().toLowerCase();
    return media
      .filter((item) => typeFilter === "all" || item.mediaType === typeFilter)
      .filter((item) => {
        if (!query) return true;
        return `${item.caption ?? ""} ${item.mediaId}`.toLowerCase().includes(query);
      })
      .slice()
      .sort((a, b) => new Date(b.lastSeenAt ?? b.postedAt ?? 0).getTime() - new Date(a.lastSeenAt ?? a.postedAt ?? 0).getTime());
  }, [media, search, typeFilter]);

  const markPreviewFailed = (mediaId: string) => {
    setFailedPreviews((current) => {
      const next = new Set(current);
      next.add(mediaId);
      return next;
    });
  };

  if (!tenantId) return null;

  const retry = () => setReloadCount((count) => count + 1);

  return (
    <div className="page page-wide page-content">
      <header className="content-header">
        <div>
          <span className="overview-eyebrow">Instagram content</span>
          <h1>Content</h1>
          <p className="muted">Posts and Reels that have received comments, using the selected Instagram account scope.</p>
        </div>
      </header>

      {error && media !== null && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={retry}>Retry</button>
        </div>
      )}

      {media === null ? (
        error ? (
          <section className="card"><ErrorState title="Content could not be loaded" description={error} action={<button type="button" className="btn-primary btn-small" onClick={retry}>Retry</button>} /></section>
        ) : (
          <section className="card"><LoadingState label="Loading content" description="Fetching posts from the selected Instagram account." /></section>
        )
      ) : (
        <>
          <div className="content-toolbar" aria-label="Content filters">
            <div className="content-type-filters" role="group" aria-label="Media type">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={typeFilter === filter.value ? "btn-primary btn-small" : "btn-secondary btn-small"}
                  aria-pressed={typeFilter === filter.value}
                  onClick={() => setTypeFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="content-search">
              <span className="sr-only">Search captions and keywords</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search captions and keywords"
                aria-label="Search captions and keywords"
              />
            </label>
          </div>

          <div className="content-sync-row">
            <span className="muted">Selected Instagram account · live production data</span>
            <button type="button" className="btn-secondary btn-small" onClick={retry} disabled={media === null}>
              Refresh posts
            </button>
          </div>

          {filteredMedia.length === 0 ? (
            media.length === 0 && !search && typeFilter === "all" ? (
              <section className="card">
                <EmptyState
                  title="No commented posts yet"
                  description="Posts will appear here after SignalAI receives a comment event for one of your connected Instagram accounts."
                />
              </section>
            ) : (
              <section className="card">
                <EmptyState
                  title="No posts match these filters"
                  description="Try a different media type or clear the caption search."
                  action={<button type="button" className="btn-secondary btn-small" onClick={() => { setTypeFilter("all"); setSearch(""); }}>Clear filters</button>}
                />
              </section>
            )
          ) : (
            <div className="content-grid">
              {filteredMedia.map((item) => {
                const hasPreview = Boolean(item.thumbnailUrl) && !failedPreviews.has(item.mediaId);
                return (
                  <article key={item.mediaId} className="card content-card">
                    {hasPreview ? (
                      <button
                        type="button"
                        className="content-media-button"
                        onClick={() => setPreviewMedia(item)}
                        aria-label={`Open ${mediaPreviewLabel(item.mediaType)}`}
                      >
                        <img
                          src={item.thumbnailUrl!}
                          alt={item.caption ? item.caption.split("\n")[0] : "Instagram post preview"}
                          className="content-media-image"
                          loading="lazy"
                          onError={() => markPreviewFailed(item.mediaId)}
                        />
                        {item.mediaType === "VIDEO" && <span className="content-media-badge" aria-label="Video"><PlayIcon className="h-3.5 w-3.5" /></span>}
                        {item.mediaType === "CAROUSEL_ALBUM" && <span className="content-media-type">Carousel</span>}
                      </button>
                    ) : (
                      <div className="content-media-unavailable">
                        <strong>Preview unavailable</strong>
                        <span>Instagram may have expired this thumbnail.</span>
                        {item.thumbnailUrl && <button type="button" className="link-button" onClick={retry}>Refresh</button>}
                      </div>
                    )}
                    <div className="content-card-body">
                      <div className="content-card-meta">
                        <span className="pill" style={{ marginLeft: 0 }}>{TYPE_LABEL[item.mediaType ?? ""] ?? "Instagram post"}</span>
                        <span>{formatRelative(item.lastSeenAt ?? item.postedAt)}</span>
                        <span>{formatSyncStatus(item)}</span>
                      </div>
                      <p className="content-caption" title={item.caption ?? undefined}>
                        {item.caption || <span className="text-subtle">No caption</span>}
                      </p>
                      <div className="content-card-footer">
                        <span>{item.commentCount} comment{item.commentCount === 1 ? "" : "s"}</span>
                        {item.commentCount > 0 && (
                          <Link className="link-button" to={`/dashboard/${tenantId}/leads?sourceMediaId=${encodeURIComponent(item.mediaId)}`}>
                            Review linked leads →
                          </Link>
                        )}
                      </div>
                      {item.permalink && (
                        <a href={item.permalink} target="_blank" rel="noreferrer" className="text-xs text-accent no-underline">
                          View on Instagram ↗
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {previewMedia && previewMedia.thumbnailUrl && (
        <div
          className="content-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewMedia(null);
          }}
        >
          <div className="content-preview-dialog" role="dialog" aria-modal="true" aria-label={mediaPreviewLabel(previewMedia.mediaType)}>
            <button type="button" className="content-preview-close" onClick={() => setPreviewMedia(null)} aria-label="Close preview">×</button>
            <div className="content-preview-image-wrap">
              <img
                src={previewMedia.thumbnailUrl}
                alt={previewMedia.caption ? previewMedia.caption.split("\n")[0] : "Instagram post preview"}
                className="content-preview-image"
                onError={() => {
                  markPreviewFailed(previewMedia.mediaId);
                  setPreviewMedia(null);
                }}
              />
            </div>
            <div className="content-preview-details">
              <div className="content-card-meta">
                <span>{TYPE_LABEL[previewMedia.mediaType ?? ""] ?? "Instagram"}</span>
                <span>·</span>
                <span>{formatRelative(previewMedia.lastSeenAt ?? previewMedia.postedAt)}</span>
                <span>·</span>
                <span>{formatSyncStatus(previewMedia)}</span>
              </div>
              <p>{previewMedia.caption || "No caption"}</p>
              {previewMedia.commentCount > 0 && <Link className="link-button" to={`/dashboard/${tenantId}/leads?sourceMediaId=${encodeURIComponent(previewMedia.mediaId)}`} onClick={() => setPreviewMedia(null)}>Review linked leads →</Link>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
