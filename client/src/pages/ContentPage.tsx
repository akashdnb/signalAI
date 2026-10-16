import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type ObservedMedia } from "../api";
import { PlayIcon } from "../components/icons";
import { useTenant } from "../context/TenantContext";

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffDay = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDay < 1) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [previewMedia, setPreviewMedia] = useState<ObservedMedia | null>(null);
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api
      .listObservedMedia(tenantId, selectedAccountId)
      .then((m) => {
        if (!cancelled) {
          setMedia(m);
          setFailedPreviews(new Set());
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401)) {
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

  const availableTypes = useMemo(() => {
    if (!media) return [];
    return Array.from(new Set(media.map((m) => m.mediaType).filter((t): t is string => Boolean(t))));
  }, [media]);

  const sorted = useMemo(() => {
    if (!media) return null;
    const filtered = typeFilter === "all" ? media : media.filter((m) => m.mediaType === typeFilter);
    return filtered.slice().sort((a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime());
  }, [media, typeFilter]);

  const markPreviewFailed = (mediaId: string) => {
    setFailedPreviews((current) => {
      const next = new Set(current);
      next.add(mediaId);
      return next;
    });
  };

  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <h1>Content</h1>
      <p className="muted">Posts and Reels people have commented on, sorted by most recently active.</p><p className="muted small mt-1">If an Instagram thumbnail has expired, refresh the list to try loading it again.</p>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          {media === null && (
            <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
              Retry
            </button>
          )}
        </div>
      )}

      {availableTypes.length > 0 && (
        <div className="filter-row">
          <button
            type="button"
            className={typeFilter === "all" ? "btn-primary btn-small" : "btn-secondary btn-small"}
            onClick={() => setTypeFilter("all")}
          >
            All
          </button>
          {availableTypes.map((t) => (
            <button
              key={t}
              type="button"
              className={typeFilter === t ? "btn-primary btn-small" : "btn-secondary btn-small"}
              onClick={() => setTypeFilter(t)}
            >
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {sorted === null ? (
        <p className="muted" role="status">{error ? "Content could not be loaded." : "Loading content…"}</p>
      ) : sorted.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No posts yet — they'll show up here once someone comments on one of your Instagram posts or Reels.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((m) => {
            const hasPreview = Boolean(m.thumbnailUrl) && !failedPreviews.has(m.mediaId);
            return (
              <div key={m.mediaId} className="card mb-0 overflow-hidden p-0">
                {hasPreview ? (
                  <button
                    type="button"
                    className="relative block aspect-square w-full cursor-pointer border-0 bg-chip p-0 text-left"
                    onClick={() => setPreviewMedia(m)}
                    aria-label={`Open ${mediaPreviewLabel(m.mediaType)}`}
                  >
                    <img
                      src={m.thumbnailUrl!}
                      alt={m.caption ? m.caption.split("\n")[0] : "Instagram post preview"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={() => markPreviewFailed(m.mediaId)}
                    />
                    {m.mediaType === "VIDEO" && (
                      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
                        <PlayIcon className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {m.mediaType === "CAROUSEL_ALBUM" && (
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
                        Carousel
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-chip text-sm text-subtle">
                    <span className="font-medium text-ink">Preview unavailable</span><span className="max-w-[16rem] px-4 text-center text-xs">Instagram may have expired this thumbnail. Refresh the content list to try again.</span>
                    {m.thumbnailUrl && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setReloadCount((count) => count + 1)}
                      >
                        Refresh
                      </button>
                    )}
                  </div>
                )}
                <div className="p-3">
                  <p className="m-0 line-clamp-2 min-h-[2.5em] break-words text-sm text-ink" title={m.caption ?? undefined}>
                    {m.caption ? m.caption.split("\n")[0] : <span className="text-subtle">No caption</span>}
                  </p>
                  {!m.caption && (
                    <p className="m-0 mt-1 break-all text-xs text-subtle">
                      {TYPE_LABEL[m.mediaType ?? ""] ?? "Instagram post"} · Media ID: {m.mediaId}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                    <span className="pill" style={{ marginLeft: 0 }}>
                      {m.commentCount} comment{m.commentCount === 1 ? "" : "s"}
                    </span>
                    <span>{formatRelative(m.lastSeenAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {m.permalink && (
                      <a
                        href={m.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent no-underline"
                      >
                        View on Instagram ↗
                      </a>
                    )}
                    {hasPreview && (
                      <button type="button" className="link-button text-xs" onClick={() => setPreviewMedia(m)}>
                        Preview
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewMedia && previewMedia.thumbnailUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewMedia(null);
          }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={mediaPreviewLabel(previewMedia.mediaType)}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-lg text-white"
              onClick={() => setPreviewMedia(null)}
              aria-label="Close preview"
            >
              ×
            </button>
            <div className="flex max-h-[70vh] items-center justify-center bg-black">
              <img
                src={previewMedia.thumbnailUrl}
                alt={previewMedia.caption ? previewMedia.caption.split("\n")[0] : "Instagram post preview"}
                className="max-h-[70vh] w-auto max-w-full object-contain"
                onError={() => {
                  markPreviewFailed(previewMedia.mediaId);
                  setPreviewMedia(null);
                }}
              />
            </div>
            <div className="p-5">
              <div className="mb-2 flex items-center gap-2 text-xs text-subtle">
                <span>{TYPE_LABEL[previewMedia.mediaType ?? ""] ?? "Instagram"}</span>
                <span>·</span>
                <span>{formatRelative(previewMedia.lastSeenAt)}</span>
              </div>
              <p className="m-0 text-sm leading-6 text-ink">
                {previewMedia.caption || "No caption"}
              </p>
              {previewMedia.permalink && (
                <a
                  href={previewMedia.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm font-medium text-accent no-underline"
                >
                  View on Instagram ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
