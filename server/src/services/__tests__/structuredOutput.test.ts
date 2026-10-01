import { describe, expect, it } from "vitest";
import { extractJsonObjectCandidates, parseFirstMatchingJsonObject } from "../structuredOutput.js";

interface ReplyShape {
  reply: string;
  qualification?: { intent?: string | null; need?: string | null } | null;
}

function isReplyShape(value: unknown): value is ReplyShape {
  return !!value && typeof value === "object" && typeof (value as Partial<ReplyShape>).reply === "string";
}

describe("structuredOutput", () => {
  describe("extractJsonObjectCandidates / parseFirstMatchingJsonObject", () => {
    it("parses a brace inside the reply string without truncating or splitting candidates", () => {
      const raw = JSON.stringify({ reply: "Your options are } today", qualification: { intent: "considering" } });
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "Your options are } today", qualification: { intent: "considering" } });
    });

    it("parses a brace inside a nested qualification field", () => {
      const raw = JSON.stringify({ reply: "ok", qualification: { need: "a {custom} enterprise setup" } });
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "ok", qualification: { need: "a {custom} enterprise setup" } });
    });

    it("parses escaped quotes inside a string value", () => {
      const raw = `{"reply": "hello {world} and \\"quotes\\"", "qualification": {"need": "3BHK"}}`;
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: 'hello {world} and "quotes"', qualification: { need: "3BHK" } });
    });

    it("parses backslashes inside a string value without breaking string-tracking", () => {
      const raw = `{"reply": "path is C:\\\\Users\\\\test, and a brace: }", "qualification": null}`;
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "path is C:\\Users\\test, and a brace: }", qualification: null });
    });

    it("parses a deeply nested qualification object", () => {
      const raw = JSON.stringify({
        reply: "noted",
        qualification: { intent: "ready_to_buy", need: "nested { thing }", extra: { deeper: { evenDeeper: "}" } } },
      });
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect((result as ReplyShape).reply).toBe("noted");
    });

    it("finds valid JSON preceded by prose", () => {
      const raw = `Sure! Here's my answer: ${JSON.stringify({ reply: "ok" })}`;
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "ok" });
    });

    it("skips an earlier balanced-but-invalid candidate and finds a later valid one", () => {
      // The first `{...}` span parses as valid JSON but has the wrong shape
      // (no `reply` field) — the scanner must move on to the second.
      const raw = `{"unrelated": true} then here: ${JSON.stringify({ reply: "the real one" })}`;
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "the real one" });
    });

    it("returns null for plain prose with no JSON at all", () => {
      const result = parseFirstMatchingJsonObject("Sure, here's the info you asked about!", isReplyShape);
      expect(result).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      const result = parseFirstMatchingJsonObject(`{"reply": "unterminated string}`, isReplyShape);
      expect(result).toBeNull();
    });

    it("does not treat a brace inside a quoted bio/username substring as structural when scanning raw prose", () => {
      // A balanced-looking but unrelated/invalid leading candidate from prose
      // (e.g. a quoted "{fitness}" aside) must be skipped in favor of the
      // real trailing object.
      const raw = `their bio says "{fitness}" lover. Reply: ${JSON.stringify({ reply: "hi" })}`;
      const result = parseFirstMatchingJsonObject(raw, isReplyShape);
      expect(result).toEqual({ reply: "hi" });
    });
  });

  describe("extractJsonObjectCandidates", () => {
    it("does not count a brace inside a string as depth-changing", () => {
      const raw = `{"a": "} not a close", "b": 1}`;
      const candidates = extractJsonObjectCandidates(raw);
      expect(candidates).toHaveLength(1);
      expect(JSON.parse(candidates[0]!)).toEqual({ a: "} not a close", b: 1 });
    });
  });
});
