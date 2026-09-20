import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOtpEmail } from "../resend.js";

describe("sendOtpEmail", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  it("logs the code instead of sending when unconfigured — the deliberate pilot escape hatch", async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendOtpEmail("a@b.com", "123456")).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("a@b.com"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("123456"));
    warnSpy.mockRestore();
  });

  it("posts to the Resend API when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendOtpEmail("a@b.com", "123456");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(options.body);
    expect(body.to).toBe("a@b.com");
    expect(body.html).toContain("123456");
  });

  it("throws when the Resend API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "invalid from address",
    });

    await expect(sendOtpEmail("a@b.com", "123456")).rejects.toThrow("Resend send failed");
  });
});
