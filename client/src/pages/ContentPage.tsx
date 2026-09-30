import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type ObservedMedia } from "../api";
import { PlayIcon } from "../components/icons";

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

/** Built on `listObservedMedia` (already backs the campaign editor's post-targeting picker) — no new backend needed. Media-type tabs are derived from whatever types actually show up in the data, not a fixed Reels/Posts/Stories split the API doesn't provide. */
export function ContentPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [media, setMedia] = useState<ObservedMedia[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api
      .listObservedMedia(tenantId)
      .then((m) => {
        if (!cancelled) setMedia(m);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load content");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

  const availableTypes = useMemo(() => {
    if (!media) return [];
    return Array.from(new Set(media.map((m) => m.mediaType).filter((t): t is string => Boolean(t))));
  }, [media]);

  const sorted = useMemo(() => {
    if (!media) return null;
    const filtered = typeFilter === "all" ? media : media.filter((m) => m.mediaType === typeFilter);
    return filtered.slice().sort((a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime());
  }, [media, typeFilter]);

  if (!tenantId) return null;

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <h1>Content</h1>
      <p className="muted">Posts and Reels people have commented on, sorted by most recently active.</p>

      {error && <div className="banner banner-error">{error}</div>}

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
        <p className="muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No posts yet — they'll show up here once someone comments on one of your Instagram posts or Reels.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((m) => (
            <div key={m.mediaId} className="card mb-0 overflow-hidden p-0">
              <div className="relative aspect-square bg-chip">
                {m.thumbnailUrl ? (
                  <img src={m.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-subtle">No preview</div>
                )}
                {m.mediaType === "VIDEO" && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                    <PlayIcon className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="m-0 line-clamp-2 min-h-[2.5em] text-sm text-ink">
                  {m.caption ? m.caption.split("\n")[0] : <span className="text-subtle">No caption</span>}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                  <span className="pill" style={{ marginLeft: 0 }}>
                    {m.commentCount} comment{m.commentCount === 1 ? "" : "s"}
                  </span>
                  <span>{formatRelative(m.lastSeenAt)}</span>
                </div>
                {m.permalink && (
                  <a
                    href={m.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-accent no-underline"
                  >
                    View on Instagram ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
