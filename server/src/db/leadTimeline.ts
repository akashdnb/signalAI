import type { Pool } from "pg";
import { listEventsForLead } from "./events.js";
import { listLeadActivity } from "./leadActivity.js";

export type TimelineEntry =
  | { kind: "event"; occurredAt: Date; eventType: string; text: string | null; username: string | null; matchedKeyword: string | null }
  | { kind: "activity"; occurredAt: Date; type: string; summary: string; actorUserId: string | null };

/**
 * Phase 2A Lead Timeline: the union of lead_events (Meta-webhook-driven)
 * and lead_activity (CRM-driven), sorted by timestamp at read time — same
 * approach the roadmap already uses for display/attribution ordering
 * elsewhere, so no shared ordering machinery is needed between two tables
 * built for very different write patterns.
 */
export async function getLeadTimeline(pool: Pool, tenantId: string, leadId: string): Promise<TimelineEntry[]> {
  const [events, activity] = await Promise.all([
    listEventsForLead(pool, tenantId, leadId),
    listLeadActivity(pool, tenantId, leadId),
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
  ];

  return entries.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
