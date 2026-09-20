import { describe, expect, it } from "vitest";
import { parseInstagramWebhookPayload } from "../instagramWebhookParser.js";

describe("parseInstagramWebhookPayload", () => {
  it("parses a comment event", () => {
    const payload = {
      entry: [
        {
          id: "acct-1",
          time: 1700000000,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment-123",
                text: "DM me LINK",
                from: { id: "user-42", username: "real_handle" },
                media: { id: "media-99", media_product_type: "FEED" },
              },
            },
          ],
        },
      ],
    };

    const events = parseInstagramWebhookPayload(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      instagramAccountId: "acct-1",
      instagramUserId: "user-42",
      metaEventId: "comment:comment-123",
      eventType: "comment",
      commentText: "DM me LINK",
      username: "real_handle",
      mediaId: "media-99",
      commentId: "comment-123",
    });
  });

  it("parses a comment event with no media object without throwing", () => {
    const payload = {
      entry: [
        {
          id: "acct-1",
          changes: [{ field: "comments", value: { id: "comment-1", from: { id: "user-1" } } }],
        },
      ],
    };

    const events = parseInstagramWebhookPayload(payload);
    expect(events).toHaveLength(1);
    expect(events[0]!.mediaId).toBeUndefined();
    expect(events[0]!.commentId).toBe("comment-1");
  });

  it("parses a message (DM) event", () => {
    const payload = {
      entry: [
        {
          id: "acct-1",
          messaging: [
            {
              sender: { id: "user-42" },
              recipient: { id: "acct-1" },
              timestamp: 1700000000000,
              message: { mid: "msg-1", text: "yes please send the link" },
            },
          ],
        },
      ],
    };

    const events = parseInstagramWebhookPayload(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      instagramAccountId: "acct-1",
      instagramUserId: "user-42",
      metaEventId: "message:msg-1",
      eventType: "message",
      dmText: "yes please send the link",
    });
  });

  it("handles a batch with multiple entries in one payload", () => {
    const payload = {
      entry: [
        { id: "acct-1", changes: [{ field: "comments", value: { id: "c1", from: { id: "u1" } } }] },
        { id: "acct-2", changes: [{ field: "comments", value: { id: "c2", from: { id: "u2" } } }] },
      ],
    };
    expect(parseInstagramWebhookPayload(payload)).toHaveLength(2);
  });

  it("ignores changes with an unrelated field", () => {
    const payload = {
      entry: [{ id: "acct-1", changes: [{ field: "mentions", value: {} }] }],
    };
    expect(parseInstagramWebhookPayload(payload)).toHaveLength(0);
  });

  it("skips entries missing the fields it needs rather than throwing", () => {
    expect(parseInstagramWebhookPayload({})).toEqual([]);
    expect(parseInstagramWebhookPayload(null)).toEqual([]);
    expect(parseInstagramWebhookPayload({ entry: [{ changes: [] }] })).toEqual([]);
    expect(
      parseInstagramWebhookPayload({
        entry: [{ id: "acct-1", changes: [{ field: "comments", value: { from: {} } }] }],
      }),
    ).toEqual([]); // no comment id
  });
});

describe("outbound DM echoes are not ingested", () => {
  const ACCOUNT = "17841408728501893";

  it("skips a messaging event flagged is_echo", () => {
    const events = parseInstagramWebhookPayload({
      object: "instagram",
      entry: [
        {
          id: ACCOUNT,
          time: 1,
          messaging: [
            { sender: { id: "lead-1" }, timestamp: 1, message: { mid: "m1", text: "hi", is_echo: true } },
          ],
        },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("skips a message sent by the connected account itself", () => {
    const events = parseInstagramWebhookPayload({
      object: "instagram",
      entry: [
        {
          id: ACCOUNT,
          time: 1,
          messaging: [{ sender: { id: ACCOUNT }, timestamp: 1, message: { mid: "m2", text: "our reply" } }],
        },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("still ingests a genuine inbound DM from a lead", () => {
    const events = parseInstagramWebhookPayload({
      object: "instagram",
      entry: [
        {
          id: ACCOUNT,
          time: 1,
          messaging: [{ sender: { id: "lead-1" }, timestamp: 1, message: { mid: "m3", text: "hello" } }],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.instagramUserId).toBe("lead-1");
  });
});
