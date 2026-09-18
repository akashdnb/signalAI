import { describe, expect, it } from "vitest";
import { appendCtaLink, renderTemplate } from "../messageComposer.js";

describe("renderTemplate", () => {
  it("substitutes username and keyword", () => {
    expect(
      renderTemplate("Hi {{username}}, thanks for asking about {{keyword}}!", {
        username: "real_handle",
        keyword: "pricing",
      }),
    ).toBe("Hi real_handle, thanks for asking about pricing!");
  });

  it("falls back to a generic greeting when username is missing", () => {
    expect(renderTemplate("Hi {{username}}!", {})).toBe("Hi there!");
  });

  it("does nothing extra when there are no placeholders", () => {
    expect(renderTemplate("Plain reply.", {})).toBe("Plain reply.");
  });
});

describe("appendCtaLink", () => {
  it("appends a CTA link when provided", () => {
    expect(appendCtaLink("Here you go!", "https://example.com/offer")).toBe(
      "Here you go! https://example.com/offer",
    );
  });

  it("returns the text unchanged when there is no CTA link", () => {
    expect(appendCtaLink("Plain reply.", undefined)).toBe("Plain reply.");
  });

  it("does not substitute anything in the text — safe for raw model output", () => {
    expect(appendCtaLink("literally {{keyword}} stays untouched", undefined)).toBe(
      "literally {{keyword}} stays untouched",
    );
  });
});
