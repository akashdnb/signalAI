import type { Pool } from "pg";
import { listEventsForLead, listEventsForLeadPage } from "./events.js";
import { listLeadActivity, listLeadActivityPage } from "./leadActivity.js";
import { listSentRepliesForLead, listSentRepliesForLeadPage, type SentReplyChannel, type SentReplyEngine } from "./sentReplies.js";

export type TimelineEntry =
  | { kind: "event"; occurredAt: Date; eventType: string; text: string | null; username: string | null; matchedKeyword: string | null }
  | { kind: "activity"; occurredAt: Date; type: string; summary: string; actorUserId: string | null }
  | { kind: "reply"; occurredAt: Date; channel: SentReplyChannel; engine: SentReplyEngine; text: string };

/**
 * Phase 2A Lead Timeline: the union of lead_events (Meta-webhook-driven),
 * lead_activity (CRM-driven), and sent_replies (what the bot actually sent
 * back — previously absent entirely, so this timeline only ever showed
 * half of every conversation), sorted by timestamp at read time — same
 * approach the roadmap already uses for display/attribution ordering
 * elsewhere, so no shared ordering machinery is needed between tables
 * built for very different write patterns.
 */
export async function getLeadTimeline(pool: Pool, tenantId: string, leadId: string): Promise<TimelineEntry[]> {
  const [events, activity, replies] = await Promise.all([
    listEventsForLead(pool, tenantId, leadId),
    listLeadActivity(pool, tenantId, leadId),
    listSentRepliesForLead(pool, tenantId, leadId),
  ]);

  const entries: TimelineEntry[] = [
    ...events.map(
      (e): TimelineEntry => ({
        kind: "event",
        occurredAt: e.occurredAt,
        eventType: e.eventType,
        text: e.eventType === "comment" ? e.commentText : e.dmText,
        username: e.username,
        matchedKeyword: e.matchedKeyword,
      }),
    ),
    ...activity.map(
      (a): TimelineEntry => ({
        kind: "activity",
        occurredAt: a.createdAt,
        type: a.type,
        summary: a.summary,
        actorUserId: a.actorUserId,
      }),
    ),
    ...replies.map(
      (r): TimelineEntry => ({
        kind: "reply",
        occurredAt: r.sentAt,
        channel: r.channel,
        engine: r.engine,
        text: r.text,
      }),
    ),
  ];

  return entries.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export interface TimelinePage {
  /** Oldest-first, same order getLeadTimeline returns — a long conversation renders top-to-bottom the same way whether paginated or not. */
  entries: TimelineEntry[];
  hasMore: boolean;
  /** Pass as `before` on the next call to load the next (older) page. Null once hasMore is false. */
  nextCursor: string | null;
}

/**
 * Cursor-paginated companion to getLeadTimeline: the unbounded version
 * fetches a lead's ENTIRE history — every event, activity row, and reply —
 * on every dashboard load (and reload after every single mutation), which
 * is slow for a long-running conversation. Each source is independently
 * fetched `limit + 1` rows deep (not just `limit`): by the standard k-way
 * top-K merge argument, fetching the top-K of each of the 3 sources is
 * exactly what's needed to correctly compute the true top-K of their
 * union — so taking K = limit + 1 per source means the first `limit + 1`
 * rows of the merged, sorted result are the TRUE global top `limit + 1`,
 * which is what makes `hasMore` (merged length > limit) trustworthy rather
 * than an assumption based on any single source alone.
 */
export async function getLeadTimelinePage(
  pool: Pool,
  tenantId: string,
  leadId: string,
  limit: number,
  before?: Date,
): Promise<TimelinePage> {
  const fetchLimit = limit + 1;
  const [events, activity, replies] = await Promise.all([
    listEventsForLeadPage(pool, tenantId, leadId, fetchLimit, before),
    listLeadActivityPage(pool, tenantId, leadId, fetchLimit, before),
    listSentRepliesForLeadPage(pool, tenantId, leadId, fetchLimit, before),
  ]);

  const merged: TimelineEntry[] = [
    ...events.map(
      (e): TimelineEntry => ({
        kind: "event",
        occurredAt: e.occurredAt,
        eventType: e.eventType,
        text: e.eventType === "comment" ? e.commentText : e.dmText,
        username: e.username,
        matchedKeyword: e.matchedKeyword,
      }),
    ),
    ...activity.map(
      (a): TimelineEntry => ({
        kind: "activity",
        occurredAt: a.createdAt,
        type: a.type,
        summary: a.summary,
        actorUserId: a.actorUserId,
      }),
    ),
    ...replies.map(
      (r): TimelineEntry => ({
        kind: "reply",
        occurredAt: r.sentAt,
        channel: r.channel,
        engine: r.engine,
        text: r.text,
      }),
    ),
  ];

  merged.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()); // newest first

  const hasMore = merged.length > limit;
  const page = merged.slice(0, limit);
  const oldest = page[page.length - 1];

  return {
    entries: page.reverse(), // back to oldest-first for display
    hasMore,
    nextCursor: hasMore && oldest ? oldest.occurredAt.toISOString() : null,
  };
}
