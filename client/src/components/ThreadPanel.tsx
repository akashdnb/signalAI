import { useEffect, useState } from "react";
import { api, type TimelineEntry } from "../api";
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
  onError?: (message: string) => void;
}

/**
 * The merged event/activity/reply timeline for one lead — extracted from
 * LeadDetailPage (which still renders it, just via this component now) so
 * InboxPage's thread view renders conversations identically rather than
 * re-implementing the same merge/pagination/rendering a second time.
 */
export function ThreadPanel({ tenantId, leadId, refreshToken, pendingEntries, kindFilter, onError }: ThreadPanelProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetryCount, setLoadRetryCount] = useState(0);
  const [olderError, setOlderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTimeline(null);
    setHasMore(false);
    setCursor(null);
    setLoadError(null);
    setOlderError(null);
    api
      .getLeadTimeline(tenantId, leadId)
      .then((page) => {
        if (cancelled) return;
        setTimeline(page.entries);
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load conversation";
        setLoadError(message);
        onError?.(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId, refreshToken, loadRetryCount]);

  async function handleLoadOlder() {
    if (!cursor) return;
    setLoadingMore(true);
    setOlderError(null);
    try {
      const page = await api.getLeadTimeline(tenantId, leadId, { before: cursor });
      setTimeline((prev) => [...page.entries, ...(prev ?? [])]);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load older messages";
      setOlderError(message);
      onError?.(message);
    } finally {
      setLoadingMore(false);
    }
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
    <div>
      {hasMore && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary btn-small" disabled={loadingMore} onClick={handleLoadOlder}>
            {loadingMore ? "Loading…" : "Load older messages"}
          </button>
          {olderError && <span className="text-sm text-subtle" role="alert">{olderError}</span>}
        </div>
      )}
      {allEntries.map((entry, i) => (
        <div className="timeline-entry" key={i}>
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
