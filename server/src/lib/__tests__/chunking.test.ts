import { describe, expect, it } from "vitest";
import { chunkText } from "../chunking.js";

describe("chunkText", () => {
  it("returns a single chunk for text shorter than chunkSize", () => {
    expect(chunkText("hello world", { chunkSize: 800, overlap: 100 })).toEqual(["hello world"]);
  });

  it("returns an empty array for empty/whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("splits text longer than chunkSize into overlapping windows", () => {
    const text = "a".repeat(25);
    const chunks = chunkText(text, { chunkSize: 10, overlap: 3 });

    // stride = 7: windows start at 0, 7, 14, 21
    expect(chunks).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(10), "a".repeat(4)]);
  });

  it("preserves content split across a chunk boundary via the overlap", () => {
    const text = "0123456789ABCDEFGHIJ"; // 20 chars
    const chunks = chunkText(text, { chunkSize: 12, overlap: 4 });

    // The tail of chunk 1 must reappear at the head of chunk 2.
    const chunk1Tail = chunks[0]!.slice(-4);
    expect(chunks[1]!.startsWith(chunk1Tail)).toBe(true);
  });

  it("rejects an overlap that is not smaller than chunkSize", () => {
    expect(() => chunkText("some text here", { chunkSize: 10, overlap: 10 })).toThrow(/overlap/);
    expect(() => chunkText("some text here", { chunkSize: 10, overlap: 20 })).toThrow(/overlap/);
  });

  it("rejects a non-positive chunkSize", () => {
    expect(() => chunkText("some text", { chunkSize: 0 })).toThrow(/chunkSize/);
  });

  it("trims surrounding whitespace from the input and each chunk", () => {
    expect(chunkText("  hello  ")).toEqual(["hello"]);
  });
});
