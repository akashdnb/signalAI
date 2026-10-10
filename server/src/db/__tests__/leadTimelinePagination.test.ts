import { describe, expect, it } from "vitest";
import { decodeTimelineCursor, getLeadTimelinePage } from "../leadTimeline.js";

function makeEventRow(id: string, occurredAt: Date) {
  return { id, event_type: "message", occurred_at: occurredAt, attributes: {}, comment_text: null, dm_text: `message-${id}`, username: "creator" };
}

function makePool(rows: ReturnType<typeof makeEventRow>[]) {
  return {
    query: async <T>(sql: string, values?: unknown[]) => {
      if (sql.includes("from lead_events")) {
        const cursorId = values?.[5] as string;
        const filtered = (cursorId ? rows.filter((row) => row.id < cursorId) : rows).sort((a, b) => b.id.localeCompare(a.id));
        return { rows: filtered.slice(0, Number(values?.[2] ?? rows.length)) } as { rows: T[] };
      }
      return { rows: [] } as { rows: T[] };
    },
  } as never;
}

describe("lead timeline cursor pagination", () => {
  it("does not skip rows sharing the same timestamp across pages", async () => {
    const timestamp = new Date("2026-10-10T10:00:00.000Z");
    const rows = Array.from({ length: 21 }, (_, index) => makeEventRow(String(100 + index).padStart(3, "0"), timestamp));
    const pool = makePool(rows);

    const page1 = await getLeadTimelinePage(pool, "tenant", "lead", 10);
    expect(page1.entries).toHaveLength(10);
    expect(page1.hasMore).toBe(true);
    const cursor = decodeTimelineCursor(page1.nextCursor!);
    expect(cursor.occurredAt.toISOString()).toBe(timestamp.toISOString());
    expect(cursor.source).toBe("event");
    expect(cursor.id).toBe("111");

    const page2 = await getLeadTimelinePage(pool, "tenant", "lead", 10, page1.nextCursor!);
    const page3 = await getLeadTimelinePage(pool, "tenant", "lead", 10, page2.nextCursor!);
    const ids = [...page1.entries, ...page2.entries, ...page3.entries].map((entry) => entry.id);

    expect(ids).toHaveLength(21);
    expect(new Set(ids).size).toBe(21);
    expect(new Set(ids)).toEqual(new Set(rows.map((row) => row.id)));
    expect(page3.hasMore).toBe(false);
  });

  it("rejects malformed opaque cursors", () => {
    expect(() => decodeTimelineCursor("not-a-cursor")).toThrow("invalid timeline cursor");
  });
});
