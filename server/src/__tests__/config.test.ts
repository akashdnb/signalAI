import { describe, expect, it } from "vitest";
import { assertWebAppOriginConfigured } from "../config.js";

describe("assertWebAppOriginConfigured (R12-01)", () => {
  it("throws on an empty origin — a silent wildcard CORS fallback is a boot-time error, not a runtime one", () => {
    expect(() => assertWebAppOriginConfigured("")).toThrow();
  });

  it("does not throw on a real origin", () => {
    expect(() => assertWebAppOriginConfigured("https://app.example.com")).not.toThrow();
  });
});
