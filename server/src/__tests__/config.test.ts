import { afterEach, describe, expect, it } from "vitest";
import { assertWebAppOriginConfigured, config } from "../config.js";

describe("assertWebAppOriginConfigured (R12-01)", () => {
  it("throws on an empty origin — a silent wildcard CORS fallback is a boot-time error, not a runtime one", () => {
    expect(() => assertWebAppOriginConfigured("")).toThrow();
  });

  it("does not throw on a real origin", () => {
    expect(() => assertWebAppOriginConfigured("https://app.example.com")).not.toThrow();
  });
});

describe("URL settings tolerate a trailing slash", () => {
  // Both of these shipped with a trailing slash and broke *after* a
  // successful OAuth: APP_BASE_URL produced `//connected`, which BUI's
  // router sends to its catch-all, and WEB_APP_ORIGIN was echoed as an
  // Access-Control-Allow-Origin that no browser Origin header can match.
  it("strips trailing slashes from APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://bui.example.com/";
    expect(config.appBaseUrl).toBe("https://bui.example.com");
  });

  it("strips trailing slashes from WEB_APP_ORIGIN", () => {
    process.env.WEB_APP_ORIGIN = "https://bui.example.com///";
    expect(config.webAppOrigin).toBe("https://bui.example.com");
  });

  it("leaves a correctly formatted value untouched", () => {
    process.env.APP_BASE_URL = "https://bui.example.com";
    expect(config.appBaseUrl).toBe("https://bui.example.com");
  });
});


describe("journeyWorkerEnabled", () => {
  const original =
    process.env.JOURNEY_WORKER_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.JOURNEY_WORKER_ENABLED;
    } else {
      process.env.JOURNEY_WORKER_ENABLED = original;
    }
  });

  it("is disabled unless explicitly enabled", () => {
    delete process.env.JOURNEY_WORKER_ENABLED;

    expect(
      config.journeyWorkerEnabled,
    ).toBe(false);
  });

  it("is enabled when JOURNEY_WORKER_ENABLED=true", () => {
    process.env.JOURNEY_WORKER_ENABLED = "true";

    expect(
      config.journeyWorkerEnabled,
    ).toBe(true);
  });

  it("rejects arbitrary values", () => {
    process.env.JOURNEY_WORKER_ENABLED = "1";

    expect(
      config.journeyWorkerEnabled,
    ).toBe(false);
  });
});
