import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMagicLinkEmail } from "../resend.js";

describe("sendMagicLinkEmail", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  it("logs the link instead of sending when unconfigured — the deliberate pilot escape hatch", async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendMagicLinkEmail("a@b.com", "https://api.example.com/auth/email/verify?token=xyz")).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("a@b.com"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("token=xyz"));
    warnSpy.mockRestore();
  });

  it("posts to the Resend API when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendMagicLinkEmail("a@b.com", "https://api.example.com/auth/email/verify?token=xyz");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(options.body);
    expect(body.to).toBe("a@b.com");
    expect(body.html).toContain("token=xyz");
  });

  it("throws when the Resend API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "invalid from address",
    });

    await expect(sendMagicLinkEmail("a@b.com", "https://api.example.com/verify")).rejects.toThrow(
      "Resend send failed",
    );
  });
});
