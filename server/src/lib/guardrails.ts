/**
 * Global Guardrails (roadmap Phase 1 Reply Engine / Security Foundations):
 * platform-owned, non-overridable. [[Phase 2C]]'s Client Guardrails layer
 * on top of this and can only narrow it, never override it — so this
 * module must never take per-tenant configuration as an input that could
 * disable a check.
 *
 * Two passes around the LLM call, not one: a system prompt saying "don't
 * do X" is a suggestion the model can be talked around. Input
 * classification and output validation are the actual enforcement — but
 * per R1-05/R2-05, the load-bearing control is structural (untrusted text
 * stays in the `user` role, never concatenated into instructions — see
 * replyEngine.ts/milestoneEngine.ts) and the output side, not a denylist
 * on the input. A denylist can't catch a real attempt (different wording,
 * another language, homoglyphs) but reliably blocks ordinary customers —
 * "does this act as a moisturizer?", "you are now my favourite brand",
 * "my system: dry skin" all matched the previous, broader patterns. What's
 * below is narrowed to phrasing that requires both a disregard/override
 * verb AND "instructions" as its object — organic customer comments
 * essentially never produce that combination.
 */

const PROMPT_INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\b[\s\S]{0,20}\b(previous|prior|above|all)\b[\s\S]{0,10}\binstructions?\b/i,
  /\bnew\s+system\s+prompt\b/i,
];

const FORBIDDEN_OUTPUT_PATTERNS = [
  // Global guardrails: no medical/legal/financial advice (roadmap).
  /\bI recommend (taking|this) (medication|drug|prescription)/i,
  /\byou should (sue|file a lawsuit)/i,
  /\bguaranteed (returns|profit|income)/i,
];

const URL_PATTERN = /\bhttps?:\/\/\S+/gi;

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const MAX_COMMENT_REPLY_LENGTH = 300; // public comment replies: short/constrained, higher guardrail strictness

/**
 * R5-02 fix: a raw `pathname.startsWith()` repeats R3-02's mistake one
 * level down — an allowed path of `/promo` also admits `/promotion-of-x`,
 * since "promo" is a string prefix of "promotion-of-x" with no separator
 * between them. Require either an exact match or the allowed path followed
 * by a `/` segment boundary.
 */
function pathIsAllowed(urlPath: string, allowedPath: string): boolean {
  if (urlPath === allowedPath) return true;
  const base = allowedPath.endsWith("/") ? allowedPath : `${allowedPath}/`;
  return urlPath.startsWith(base);
}

export interface InputClassification {
  blocked: boolean;
  reason?: string;
}

/**
 * Runs BEFORE generation. Comment/DM text is attacker-controlled input
 * flowing into a prompt whose output can post publicly under the client's
 * brand — this is what catches an attempted prompt injection before it
 * ever reaches the model, rather than hoping the model resists it. Kept
 * deliberately narrow (see module doc) — a wide net here costs real leads.
 */
export function classifyInput(text: string): InputClassification {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { blocked: true, reason: `input matched injection pattern: ${pattern}` };
    }
  }
  return { blocked: false };
}

export interface OutputValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Runs AFTER generation, before send. Catches leakage even when the input
 * looked benign — the real safety net, not the system prompt. `allowedLink`
 * is the campaign's own CTA (already appended to `text` by the caller
 * before this runs) — R2-05: any OTHER link in a generated reply is
 * rejected, since an AI-generated public comment posting an arbitrary URL
 * under the client's brand is the one injection outcome that actually
 * matters commercially.
 */
export function validateOutput(text: string, tier: "comment" | "dm", allowedLink?: string): OutputValidation {
  for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: `output matched forbidden pattern: ${pattern}` };
    }
  }

  // R3-02 fix: startsWith let `https://cta.link.evil.com` through when the
  // allowed CTA was `https://cta.link` — a same-prefix, different-origin
  // bypass. Parse both and compare origin + a pathname-prefix, which a
  // string prefix can't be tricked into matching across origins.
  const urls = text.match(URL_PATTERN) ?? [];
  if (urls.length > 0) {
    const allowed = allowedLink ? safeParseUrl(allowedLink) : null;
    for (const rawUrl of urls) {
      const url = safeParseUrl(rawUrl);
      if (!allowed || !url || url.origin !== allowed.origin || !pathIsAllowed(url.pathname, allowed.pathname)) {
        return { allowed: false, reason: `output contains a link not on the allowlist: ${rawUrl}` };
      }
    }
  }

  if (tier === "comment" && text.length > MAX_COMMENT_REPLY_LENGTH) {
    return { allowed: false, reason: `comment reply exceeds ${MAX_COMMENT_REPLY_LENGTH} chars` };
  }

  return { allowed: true };
}
