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
  onError?: (message: string) => void;
}

/**
 * The merged event/activity/reply timeline for one lead — extracted from
 * LeadDetailPage (which still renders it, just via this component now) so
 * InboxPage's thread view renders conversations identically rather than
 * re-implementing the same merge/pagination/rendering a second time.
 */
export function ThreadPanel({ tenantId, leadId, refreshToken, pendingEntries, onError }: ThreadPanelProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTimeline(null);
    setHasMore(false);
    setCursor(null);
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
        onError?.(err instanceof Error ? err.message : "Failed to load conversation");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId, refreshToken]);

  async function handleLoadOlder() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.getLeadTimeline(tenantId, leadId, { before: cursor });
      setTimeline((prev) => [...page.entries, ...(prev ?? [])]);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }

  if (timeline === null) return <p className="muted">Loading…</p>;

  const allEntries = pendingEntries?.length ? [...timeline, ...pendingEntries] : timeline;
  if (allEntries.length === 0) return <p className="muted">Nothing has happened on this lead yet.</p>;

  return (
    <div>
      {hasMore && (
        <button className="btn-secondary btn-small" disabled={loadingMore} onClick={handleLoadOlder}>
          {loadingMore ? "Loading…" : "Load older messages"}
        </button>
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
