import { describe, expect, it } from "vitest";
import { renderTemplate } from "../messageComposer.js";

describe("renderTemplate", () => {
  it("substitutes username and keyword", () => {
    expect(renderTemplate("Hi {{username}}, thanks for asking about {{keyword}}!", {
      username: "real_handle",
      keyword: "pricing",
    })).toBe("Hi real_handle, thanks for asking about pricing!");
  });

  it("falls back to a generic greeting when username is missing", () => {
    expect(renderTemplate("Hi {{username}}!", {})).toBe("Hi there!");
  });

  it("appends a CTA link when provided", () => {
    expect(renderTemplate("Here you go!", { ctaLink: "https://example.com/offer" })).toBe(
      "Here you go! https://example.com/offer",
    );
  });

  it("does nothing extra when there is no CTA link and no placeholders", () => {
    expect(renderTemplate("Plain reply.", {})).toBe("Plain reply.");
  });
});
