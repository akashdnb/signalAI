import type { Pool } from "pg";
import { listEventsForLead, listEventsForLeadPage } from "./events.js";
import { listLeadActivity, listLeadActivityPage } from "./leadActivity.js";
import { listSentRepliesForLead, listSentRepliesForLeadPage, type SentReplyChannel, type SentReplyEngine } from "./sentReplies.js";

export type TimelineSource = "event" | "activity" | "reply";

// Source rank is part of the cursor contract. Higher rank sorts first when
// timestamps are equal, making the merged timeline a total order.
const SOURCE_RANK: Record<TimelineSource, number> = {
  event: 3,
  reply: 2,
  activity: 1,
};

export type TimelineEntry =
  | { kind: "event"; source: "event"; id: string; occurredAt: Date; eventType: string; text: string | null; username: string | null; matchedKeyword: string | null }
  | { kind: "activity"; source: "activity"; id: string; occurredAt: Date; type: string; summary: string; actorUserId: string | null }
  | { kind: "reply"; source: "reply"; id: string; occurredAt: Date; channel: SentReplyChannel; engine: SentReplyEngine; text: string };

function compareNewestFirst(a: TimelineEntry, b: TimelineEntry): number {
  const timeDiff = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (timeDiff !== 0) return timeDiff;
  const rankDiff = SOURCE_RANK[b.source] - SOURCE_RANK[a.source];
  if (rankDiff !== 0) return rankDiff;
  return b.id.localeCompare(a.id);
}

function encodeCursor(entry: TimelineEntry): string {
  const payload = JSON.stringify({
    occurredAt: entry.occurredAt.toISOString(),
    source: entry.source,
    id: entry.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(value: string): { occurredAt: Date; source: TimelineSource; sourceRank: number; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid timeline cursor");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("invalid timeline cursor");
  const candidate = parsed as Record<string, unknown>;
  const source = candidate.source;
  const id = candidate.id;
  const occurredAt = candidate.occurredAt;
  if ((source !== "event" && source !== "activity" && source !== "reply") || typeof id !== "string" || !id || typeof occurredAt !== "string") {
    throw new Error("invalid timeline cursor");
  }
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timeline cursor");
  return { occurredAt: date, source, sourceRank: SOURCE_RANK[source], id };
}

function toTimelineEntries(
  events: Awaited<ReturnType<typeof listEventsForLead>>,
  activity: Awaited<ReturnType<typeof listLeadActivity>>,
  replies: Awaited<ReturnType<typeof listSentRepliesForLead>>,
): TimelineEntry[] {
  return [
    ...events.map((e): TimelineEntry => ({ source: "event", kind: "event", id: e.id, occurredAt: e.occurredAt, eventType: e.eventType, text: e.eventType === "comment" ? e.commentText : e.dmText, username: e.username, matchedKeyword: e.matchedKeyword })),
    ...activity.map((a): TimelineEntry => ({ source: "activity", kind: "activity", id: a.id, occurredAt: a.createdAt, type: a.type, summary: a.summary, actorUserId: a.actorUserId })),
    ...replies.map((r): TimelineEntry => ({ source: "reply", kind: "reply", id: r.id, occurredAt: r.sentAt, channel: r.channel, engine: r.engine, text: r.text })),
  ];
}

export async function getLeadTimeline(pool: Pool, tenantId: string, leadId: string): Promise<TimelineEntry[]> {
  const [events, activity, replies] = await Promise.all([
    listEventsForLead(pool, tenantId, leadId),
    listLeadActivity(pool, tenantId, leadId),
    listSentRepliesForLead(pool, tenantId, leadId),
  ]);
  return toTimelineEntries(events, activity, replies).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.id.localeCompare(b.id));
}

export interface TimelinePage {
  /** Oldest-first, same display order as getLeadTimeline. */
  entries: TimelineEntry[];
  hasMore: boolean;
  /** Opaque base64url cursor containing occurredAt + source + unique id. */
  nextCursor: string | null;
}

export async function getLeadTimelinePage(
  pool: Pool,
  tenantId: string,
  leadId: string,
  limit: number,
  beforeCursor?: string,
): Promise<TimelinePage> {
  const cursor = beforeCursor ? decodeCursor(beforeCursor) : undefined;
  const fetchLimit = limit + 1;
  const [events, activity, replies] = await Promise.all([
    listEventsForLeadPage(pool, tenantId, leadId, fetchLimit, cursor, SOURCE_RANK.event),
    listLeadActivityPage(pool, tenantId, leadId, fetchLimit, cursor, SOURCE_RANK.activity),
    listSentRepliesForLeadPage(pool, tenantId, leadId, fetchLimit, cursor, SOURCE_RANK.reply),
  ]);

  const merged: TimelineEntry[] = [
    ...events.map((e): TimelineEntry => ({ source: "event", kind: "event", id: e.id, occurredAt: e.occurredAt, eventType: e.eventType, text: e.eventType === "comment" ? e.commentText : e.dmText, username: e.username, matchedKeyword: e.matchedKeyword })),
    ...activity.map((a): TimelineEntry => ({ source: "activity", kind: "activity", id: a.id, occurredAt: a.createdAt, type: a.type, summary: a.summary, actorUserId: a.actorUserId })),
    ...replies.map((r): TimelineEntry => ({ source: "reply", kind: "reply", id: r.id, occurredAt: r.sentAt, channel: r.channel, engine: r.engine, text: r.text })),
  ];

  merged.sort(compareNewestFirst);
  const hasMore = merged.length > limit;
  const pageNewestFirst = merged.slice(0, limit);
  const oldest = pageNewestFirst[pageNewestFirst.length - 1];

  return {
    entries: pageNewestFirst.reverse(),
    hasMore,
    nextCursor: hasMore && oldest ? encodeCursor(oldest) : null,
  };
}

export { decodeCursor as decodeTimelineCursor, encodeCursor as encodeTimelineCursor };
