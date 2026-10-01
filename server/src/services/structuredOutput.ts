/**
 * Shared JSON-object extraction for structured LLM output, used by both
 * replyEngine.ts and milestoneEngine.ts. Models sometimes wrap their JSON
 * in prose even when asked for a pure object (responseFormat: "json_object"
 * is a request, not a guarantee across every provider), so this tries every
 * `{`-starting balanced span in the raw text rather than assuming the whole
 * response is the object.
 *
 * The scanner is JSON-string-aware: a `{` or `}` that appears inside a JSON
 * string literal (e.g. a reply like `"Your options are } today"`) must never
 * be counted as a structural brace. Without that, a balanced-looking span
 * ending on a brace that's actually inside a string would be sliced short
 * and fail to parse, or — worse — a LATER real closing brace would never be
 * reached at all.
 */
export function extractJsonObjectCandidates(raw: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < raw.length; start++) {
    if (raw[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < raw.length; i++) {
      const char = raw[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
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

/**
 * Returns the first candidate that parses as JSON and satisfies `isShape`,
 * or null. Tries the whole trimmed response as a single JSON.parse first —
 * the common case for a well-behaved provider honoring responseFormat:
 * "json_object" — before falling back to scanning for an embedded object
 * inside surrounding prose.
 */
export function parseFirstMatchingJsonObject<T>(raw: string, isShape: (value: unknown) => value is T): T | null {
  const trimmed = raw.trim();
  try {
    const wholeParse: unknown = JSON.parse(trimmed);
    if (isShape(wholeParse)) return wholeParse;
  } catch {
    // not pure JSON — fall through to scanning for an embedded candidate
  }

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
