import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInstagramUsername } from "../instagramProfile.js";

describe("fetchInstagramUsername", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses the Instagram Login profile API and returns the username", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ username: "real_handle" }),
    });

    const username = await fetchInstagramUsername("token-1", "igsid-1");
    expect(username).toBe("real_handle");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://graph.instagram.com/v25.0/igsid-1?fields=username");
    expect(options.headers.Authorization).toBe("Bearer token-1");
  });

  it("returns null when the profile has no username field", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    expect(await fetchInstagramUsername("token-1", "igsid-1")).toBeNull();
  });

  it("throws when the Graph API responds with an error so the queue can retry", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    await expect(fetchInstagramUsername("token-1", "igsid-1"))
      .rejects.toThrow("Instagram profile lookup failed: 429 rate limited");
  });
});
