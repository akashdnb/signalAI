import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInstagramMessage } from "../instagramSend.js";

function lastBody(fetchMock: ReturnType<typeof vi.spyOn>) {
  const request = fetchMock.mock.calls[0]![1] as RequestInit;
  return JSON.parse(String(request.body));
}

describe("sendInstagramMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the button template only for an explicit HTTPS CTA", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "rich-message-1" }), { status: 200 }),
    );

    const result = await sendInstagramMessage(
      "token",
      "recipient-1",
      "To share complete details, please fill out the enquiry form below.",
      { ctaUrl: "https://example.com/enquiry" },
    );

    expect(result.metaMessageId).toBe("rich-message-1");
    expect(lastBody(fetchMock).message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "To share complete details, please fill out the enquiry form below.",
          buttons: [{ type: "web_url", url: "https://example.com/enquiry", title: "View details" }],
        },
      },
    });
  });

  it("supports a card-only message without an outer text body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "card-message-1" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "", {
      presentation: {
        type: "card",
        card: {
          title: "Latest collection",
          subtitle: "Explore the newest options",
          imageUrl: "https://cdn.example.com/collection.jpg",
          buttons: [{ type: "web_url", url: "https://example.com/collection", title: "View collection" }],
        },
      },
    });

    expect(lastBody(fetchMock).message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Latest collection",
            image_url: "https://cdn.example.com/collection.jpg",
            subtitle: "Explore the newest options",
            default_action: { type: "web_url", url: "https://example.com/collection" },
            buttons: [{ type: "web_url", url: "https://example.com/collection", title: "View collection" }],
          }],
        },
      },
    });
  });

  it("supports multi-button templates and journey postbacks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "buttons-message-1" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "What would you like to explore?", {
      presentation: {
        type: "buttons",
        buttons: [
          { type: "web_url", title: "Pricing", url: "https://example.com/pricing" },
          { type: "web_url", title: "Demo", url: "https://example.com/demo" },
          { type: "postback", title: "More info", payload: "signalai:node:more-info" },
        ],
      },
    });

    expect(lastBody(fetchMock).message.attachment.payload).toEqual({
      template_type: "button",
      text: "What would you like to explore?",
      buttons: [
        { type: "web_url", title: "Pricing", url: "https://example.com/pricing" },
        { type: "web_url", title: "Demo", url: "https://example.com/demo" },
        { type: "postback", title: "More info", payload: "signalai:node:more-info" },
      ],
    });
  });

  it("supports quick replies without truncating their labels", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "quick-replies-1" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "What are you looking for?", {
      presentation: {
        type: "quick_replies",
        replies: [
          { title: "Pricing", payload: "intent:pricing" },
          { title: "Demo", payload: "intent:demo" },
        ],
      },
    });

    expect(lastBody(fetchMock).message).toEqual({
      text: "What are you looking for?",
      quick_replies: [
        { content_type: "text", title: "Pricing", payload: "intent:pricing" },
        { content_type: "text", title: "Demo", payload: "intent:demo" },
      ],
    });
  });

  it("supports a gallery with up to ten cards", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "gallery-1" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "", {
      presentation: {
        type: "gallery",
        cards: [
          { title: "Starter", imageUrl: "https://cdn.example.com/starter.jpg", buttons: [{ type: "web_url", title: "Choose", url: "https://example.com/starter" }] },
          { title: "Pro", imageUrl: "https://cdn.example.com/pro.jpg", buttons: [{ type: "web_url", title: "Choose", url: "https://example.com/pro" }] },
        ],
      },
    });

    expect(lastBody(fetchMock).message.attachment.payload.elements).toHaveLength(2);
    expect(lastBody(fetchMock).message.attachment.payload.elements[1]).toMatchObject({
      title: "Pro",
      image_url: "https://cdn.example.com/pro.jpg",
    });
  });

  it("does not infer rich actions from an arbitrary trailing URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "text-message-1" }), { status: 200 }),
    );
    const text = "Here is the article: https://example.com/article";

    await sendInstagramMessage("token", "recipient-1", text);

    expect(lastBody(fetchMock).message).toEqual({ text });
  });

  it("falls back to the original text when structured content would truncate or lose the authored body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "fallback-1" }), { status: 200 }),
    );
    const text = "Explore our full collection and ask us anything.";

    await sendInstagramMessage("token", "recipient-1", text, {
      presentation: {
        type: "card",
        card: {
          title: "Collection",
          subtitle: "A different sentence",
          imageUrl: "https://cdn.example.com/collection.jpg",
        },
      },
    });

    expect(lastBody(fetchMock).message).toEqual({ text });
  });

  it("rejects an invalid structured-only message instead of sending an empty text fallback", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "unused" }), { status: 200 }),
    );

    await expect(sendInstagramMessage("token", "recipient-1", "", {
      presentation: {
        type: "quick_replies",
        replies: [{ title: "This label is much too long", payload: "intent:pricing" }],
      },
    })).rejects.toThrow("Invalid Instagram message presentation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not truncate long copy to fit a button template", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "long-message-1" }), { status: 200 }),
    );
    const longBody = "x".repeat(641);

    await sendInstagramMessage("token", "recipient-1", longBody, {
      ctaUrl: "https://example.com/enquiry",
    });

    expect(lastBody(fetchMock).message).toEqual({ text: longBody });
  });

  it("adds Meta's HUMAN_AGENT message tag only when explicitly requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message_id: "human-agent-1" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "I checked your support issue.", undefined, { humanAgent: true });
    expect(lastBody(fetchMock)).toMatchObject({
      recipient: { id: "recipient-1" },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
      message: { text: "I checked your support issue." },
    });

    fetchMock.mockClear();
    await sendInstagramMessage("token", "recipient-1", "A normal in-window reply.");
    const standardBody = lastBody(fetchMock);
    expect(standardBody).not.toHaveProperty("messaging_type");
    expect(standardBody).not.toHaveProperty("tag");
  });
});
