import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMediaMetadata, findMediaByPermalink } from "../instagramMedia.js";

describe("fetchMediaMetadata", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns metadata for a single media id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "media-1",
        caption: "hello",
        media_type: "IMAGE",
        thumbnail_url: "https://x/thumb.jpg",
        permalink: "https://www.instagram.com/p/abc/",
        timestamp: "2026-01-01T00:00:00+0000",
      }),
    });

    const result = await fetchMediaMetadata("token-1", "media-1");
    expect(result).toMatchObject({
      mediaId: "media-1",
      caption: "hello",
      mediaType: "IMAGE",
      thumbnailUrl: "https://x/thumb.jpg",
      permalink: "https://www.instagram.com/p/abc/",
    });
    expect(result.postedAt).toEqual(new Date("2026-01-01T00:00:00+0000"));

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain("media-1");
    expect(options.headers.Authorization).toBe("Bearer token-1");
  });

  it("throws on a Graph API error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad id",
    });

    await expect(fetchMediaMetadata("token-1", "media-1")).rejects.toThrow("Instagram media API failed");
  });
});

describe("findMediaByPermalink", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns null immediately for a URL with no recognizable shortcode", async () => {
    const result = await findMediaByPermalink("token-1", "acct-1", "https://example.com/not-instagram");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("matches by shortcode, tolerating query params and /reel/ vs /p/", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "media-other", permalink: "https://www.instagram.com/p/zzz999/" },
          { id: "media-match", permalink: "https://www.instagram.com/reel/abc123/", caption: "matched" },
        ],
      }),
    });

    const result = await findMediaByPermalink(
      "token-1",
      "acct-1",
      "https://instagram.com/p/abc123/?igsh=xyz", // user pasted a /p/ link with a tracking param, sans www.
    );

    expect(result).toMatchObject({ mediaId: "media-match", caption: "matched" });
  });

  it("pages through results (paging.next) until a match is found", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "media-page1", permalink: "https://www.instagram.com/p/nope/" }],
          paging: { next: "https://graph.instagram.com/v21.0/acct-1/media?after=cursor1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "media-page2", permalink: "https://www.instagram.com/p/found/" }] }),
      });

    const result = await findMediaByPermalink("token-1", "acct-1", "https://www.instagram.com/p/found/");
    expect(result?.mediaId).toBe("media-page2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no page contains a match", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "media-other", permalink: "https://www.instagram.com/p/zzz999/" }] }),
    });

    const result = await findMediaByPermalink("token-1", "acct-1", "https://www.instagram.com/p/nowhere/");
    expect(result).toBeNull();
  });
});
