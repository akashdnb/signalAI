/**
 * Shared JSON-object extraction for structured LLM output, used by both
 * replyEngine.ts and milestoneEngine.ts. Models sometimes wrap their JSON
 * in prose even when asked for a pure object (responseFormat: "json_object"
 * is a request, not a guarantee across every provider), so this tries every
 * `{`-starting balanced span in the raw text rather than assuming the whole
 * response is the object.
 */
export function extractJsonObjectCandidates(raw: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < raw.length; start++) {
    if (raw[start] !== "{") continue;
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(raw.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

/** Returns the first candidate that parses as JSON and satisfies `isShape`, or null. */
export function parseFirstMatchingJsonObject<T>(raw: string, isShape: (value: unknown) => value is T): T | null {
  for (const candidate of extractJsonObjectCandidates(raw)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isShape(parsed)) return parsed;
    } catch {
      // not valid JSON — try the next candidate
    }
  }
  return null;
}
