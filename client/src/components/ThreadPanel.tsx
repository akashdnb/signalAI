import { useEffect, useRef, useState } from "react";
import { api, type TimelineEntry } from "../api";
import { getLeadTimelinePage } from "../api/leadTimeline";
import { formatDate } from "../lib/leadFormatting";

export interface ThreadPanelProps {
  tenantId: string;
  leadId: string;
  /** Bump (e.g. increment a counter) to force a refetch of the most recent page — e.g. after adding a note, changing handoff status, or a reply send resolves. */
  refreshToken?: number;
  /** Rendered after the fetched timeline, for a send that hasn't round-tripped yet — the caller owns this list (add on submit, clear once refreshToken's refetch has picked it up for real). */
  pendingEntries?: TimelineEntry[];
  /** Restricts which entries render (e.g. LeadDetailPage's Conversation vs Activities tabs) — fetch/pagination still cover the full merged history regardless, this only filters what's shown. */
  kindFilter?: TimelineEntry["kind"][];
  /** Number of entries per page. Defaults to 10 so conversations open on a small recent window. */
  pageSize?: number;
  onError?: (message: string | null) => void;
}

/**
 * The merged event/activity/reply timeline for one lead — extracted from
 * LeadDetailPage (which still renders it, just via this component now) so
 * InboxPage's thread view renders conversations identically rather than
 * re-implementing the same merge/pagination/rendering a second time.
 */
export function ThreadPanel({
  tenantId,
  leadId,
  refreshToken,
  pendingEntries,
  kindFilter,
  pageSize = 10,
  onError,
}: ThreadPanelProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetryCount, setLoadRetryCount] = useState(0);
  const [olderError, setOlderError] = useState<string | null>(null);
  const initialLoadFailedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = (before?: string) =>
    getLeadTimelinePage(tenantId, leadId, { before, limit: pageSize });

  useEffect(() => {
    let cancelled = false;
    setTimeline(null);
    setHasMore(false);
    setCursor(null);
    setLoadError(null);
    setOlderError(null);
    fetchPage()
      .then((page) => {
        if (cancelled) return;
        setTimeline(page.entries);
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
        if (initialLoadFailedRef.current) {
          initialLoadFailedRef.current = false;
          onError?.(null);
        }
        // Timeline entries are returned oldest-first. The conversation UI
        // should open at the newest entry, so position the scroll viewport
        // at the bottom after the first page has rendered.
        requestAnimationFrame(() => {
          const element = scrollRef.current;
          if (element) element.scrollTop = element.scrollHeight;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load conversation";
        initialLoadFailedRef.current = true;
        setLoadError(message);
        onError?.(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId, refreshToken, loadRetryCount, pageSize]);

  async function handleLoadOlder() {
    if (!cursor || loadingMore) return;
    const element = scrollRef.current;
    const previousScrollHeight = element?.scrollHeight ?? 0;
    const previousScrollTop = element?.scrollTop ?? 0;

    setLoadingMore(true);
    setOlderError(null);
    try {
      const page = await fetchPage(cursor);
      setTimeline((prev) => [...page.entries, ...(prev ?? [])]);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
      if (olderError) onError?.(null);

      // Older entries are prepended. Keep the same message anchored in the
      // viewport instead of jumping the user when the DOM gets taller.
      requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (!current) return;
        current.scrollTop = current.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load older messages";
      setOlderError(message);
      onError?.(message);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleScroll() {
    const element = scrollRef.current;
    if (!element || loadingMore || !hasMore || !cursor) return;
    // Load before the user reaches the very top so pagination feels like a
    // continuous chat history rather than a separate "Load more" workflow.
    if (element.scrollTop <= 120) void handleLoadOlder();
  }

  if (timeline === null) {
    if (loadError) {
      return (
        <div className="space-y-2" role="alert">
          <p className="muted m-0">Couldn't load this conversation: {loadError}</p>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => setLoadRetryCount((count) => count + 1)}
          >
            Retry loading messages
          </button>
        </div>
      );
    }
    return <p className="muted" role="status">Loading conversation…</p>;
  }

  const merged = pendingEntries?.length ? [...timeline, ...pendingEntries] : timeline;
  const allEntries = kindFilter ? merged.filter((e) => kindFilter.includes(e.kind)) : merged;
  if (allEntries.length === 0) return <p className="muted">Nothing here yet.</p>;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" onScroll={handleScroll}>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
        {hasMore && (
          <button type="button" className="btn-secondary btn-small" disabled={loadingMore} onClick={() => void handleLoadOlder()}>
            {loadingMore ? "Loading older messages…" : "Load older messages"}
          </button>
        )}
        {olderError && <span className="text-sm text-subtle" role="alert">{olderError}</span>}
      </div>
      {allEntries.map((entry, i) => (
        <div className="timeline-entry" key={`${entry.occurredAt}-${entry.kind}-${i}`}>
          {entry.kind === "event" ? (
            <>
              <strong>{entry.eventType === "comment" ? "Comment" : "DM"}</strong>
              {entry.matchedKeyword && <span className="pill pill-ok">{entry.matchedKeyword}</span>}
              <div>{entry.text ?? "—"}</div>
            </>
          ) : entry.kind === "reply" ? (
            <>
              <strong>
                {entry.engine === "human" ? "Team reply" : "Bot reply"} ({entry.channel === "comment" ? "comment" : "DM"})
              </strong>
              <span className="pill">
                {entry.engine === "human" ? "Sent by a teammate" : entry.engine === "ai_generated" ? "AI-generated" : "Rule-based"}
              </span>
              <div>{entry.text}</div>
            </>
          ) : (
            <div>{entry.summary}</div>
          )}
          <div className="timeline-meta">{formatDate(entry.occurredAt)}</div>
        </div>
      ))}
    </div>
  );
}
