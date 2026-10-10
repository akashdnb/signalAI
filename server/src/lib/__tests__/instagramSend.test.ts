import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInstagramMessage } from "../instagramSend.js";

describe("sendInstagramMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Instagram button template for an explicit HTTPS CTA", async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "To share complete details, please fill out the enquiry form below.",
          buttons: [
            {
              type: "web_url",
              url: "https://example.com/enquiry",
              title: "View details",
            },
          ],
        },
      },
    });
  });

  it("uses the Generic Template when an image is explicitly provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "card-message-1" }), { status: 200 }),
    );

    await sendInstagramMessage(
      "token",
      "recipient-1",
      "Explore our latest collection and see the available options.",
      {
        ctaUrl: "https://example.com/collection",
        imageUrl: "https://cdn.example.com/collection.jpg",
        title: "Latest collection",
        subtitle: "Explore the newest options",
        buttonTitle: "View collection",
      },
    );

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: "Latest collection",
              image_url: "https://cdn.example.com/collection.jpg",
              subtitle: "Explore the newest options",
              default_action: {
                type: "web_url",
                url: "https://example.com/collection",
              },
              buttons: [
                {
                  type: "web_url",
                  url: "https://example.com/collection",
                  title: "View collection",
                },
              ],
            },
          ],
        },
      },
    });
  });

  it("keeps an ordinary trailing URL plain when the caller explicitly opts out of legacy CTA inference", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "text-message-1" }), { status: 200 }),
    );

    await sendInstagramMessage(
      "token",
      "recipient-1",
      "Here is the article: https://example.com/article",
      {},
    );

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({
      text: "Here is the article: https://example.com/article",
    });
  });

  it("preserves the existing legacy trailing-CTA behavior", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "legacy-rich-message-1" }), { status: 200 }),
    );

    await sendInstagramMessage(
      "token",
      "recipient-1",
      "To share complete details, please fill out the enquiry form below. https://example.com/enquiry",
    );

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "To share complete details, please fill out the enquiry form below.",
          buttons: [
            {
              type: "web_url",
              url: "https://example.com/enquiry",
              title: "View details",
            },
          ],
        },
      },
    });
  });

  it("keeps messages without a CTA as plain text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "text-message-2" }), { status: 200 }),
    );

    await sendInstagramMessage("token", "recipient-1", "Thanks! We will get back to you shortly.");

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({ text: "Thanks! We will get back to you shortly." });
  });

  it("does not truncate long replies just to fit a button template", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message_id: "long-message-1" }), { status: 200 }),
    );
    const longBody = "x".repeat(641);

    await sendInstagramMessage(
      "token",
      "recipient-1",
      longBody,
      { ctaUrl: "https://example.com/enquiry" },
    );

    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.message).toEqual({ text: longBody });
  });
});
