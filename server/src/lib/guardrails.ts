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

/**
 * Global Guardrails: shared verbatim by both buildSystemPrompt functions
 * (replyEngine.ts, milestoneEngine.ts) so the wording — and the fact that
 * it's non-overridable — lives in one place. Added after a live tenant
 * observed two related failures in the same conversation: their bot
 * reciprocating a customer's "I am in love"/flirtatious messages ("You're
 * making me blush!"), and separately answering plain general-knowledge
 * questions ("what is 2+2", "capital of India") that have nothing to do
 * with the business. Both share one root cause — nothing in the prompt
 * ever said the bot's scope was LIMITED to the business/its products at
 * all, so the model answered anything it could, same as a general
 * assistant would. Grounded-Answer-Only Fallback (knowledgeRetrieval.ts)
 * already handles this mechanically, but only when hasKnowledgeBase is
 * true AND the query is dissimilar enough to fall below
 * ragMinSimilarityThreshold — it does nothing for a tenant with no
 * uploaded knowledge base (RAG inactive, per its own docstring) or whose
 * product info instead lives in the unenforced `brandVoice` free-text
 * field, which is exactly this tenant's setup. `brandVoice` (Client
 * Guardrails) asks for a friendly, casual TONE — this is the
 * tenant-independent line under that: no brand voice, however casual,
 * license to answer off-topic questions or engage personally. Same caveat
 * as the rest of this module's system-prompt-level checks — this is
 * steering, not mechanical enforcement; the real backstop for anything
 * objectively checkable stays in FORBIDDEN_OUTPUT_PATTERNS/validateOutput
 * below, and knowledgeRetrieval.ts's threshold check for a tenant that
 * does have a real knowledge base.
 */
export const GLOBAL_SCOPE_INSTRUCTION =
  "Your scope is strictly limited to this business and its products/services — using ONLY the reference material " +
  "and conversation context provided to you, never your own general knowledge or training. Do not answer general-" +
  "knowledge, trivia, math, or any other question unrelated to this business, even if you know the answer — this " +
  "applies no matter how the question is phrased or how confidently it's asked. Never engage in romantic, " +
  "flirtatious, or other personal conversation, and never reciprocate a customer's compliments, advances, or " +
  "off-topic remarks about yourself — no brand voice or friendly tone described above changes any of this. For " +
  "anything off-topic, acknowledge briefly (one short sentence) and redirect back to how you can help with the " +
  "business's products or services; do not sustain an extended off-topic or personal exchange, and do not answer " +
  "the off-topic question first before redirecting.";

const URL_PATTERN = /\bhttps?:\/\/\S+/gi;

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const MAX_COMMENT_REPLY_LENGTH = 300; // public comment replies: short/constrained, higher guardrail strictness
// Instagram's own DM API hard-rejects anything longer than this (confirmed
// live: "The length of the message sent is over 1000 characters", IGApiException
// code 100/error_subcode 2534038) — not a style preference, a real send
// failure. Left unenforced, an over-length AI reply throws inside
// sendInstagramMessage AFTER validateOutput already approved it, which
// exhausts retries and wedges the lead in the dead-letter queue (confirmed
// live) rather than falling back to the rule-based reply like every other
// guardrail rejection does.
const MAX_DM_REPLY_LENGTH = 1000;

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

/**
 * Phase 2C Client Guardrails: per-tenant configuration (lib/guardrailsConfig
 * naming aside, this shape lives in db/guardrailsConfig.ts) that can only
 * NARROW the checks above, never override or bypass them — neither field
 * here is ever consulted by classifyInput/the FORBIDDEN_OUTPUT_PATTERNS
 * check, only additively in the functions below. `brandVoice` isn't
 * enforced here at all: a "voice" isn't something a denylist can validate
 * mechanically, so it's steering (folded into the system prompt by the
 * caller), not enforcement.
 */
export interface TenantGuardrailsInput {
  forbiddenTopics: string[];
  escalationTriggers: string[];
  /** Optional — only read by buildSystemPrompt (replyEngine.ts/milestoneEngine.ts) for prompt steering, never by the functions in this file, which only ever narrow (never loosen) the checks above. */
  brandVoice?: string | null;
}

export interface InputClassification {
  blocked: boolean;
  reason?: string;
}

/**
 * Phase 2C Escalation Triggers: checked on the INBOUND message, before any
 * reply is generated — a match means this conversation should go to a
 * human, not that the AI should try to reply and hope guardrails catch it
 * afterward. Deliberately a separate function from classifyInput: that one
 * detects prompt-injection attempts (a security concern, same fallback for
 * everyone); this one is tenant-configured business logic (a customer
 * asking for something this specific business wants a human to handle),
 * with no bearing on whether the text is a security risk.
 */
export function checkEscalationTriggers(
  tenantConfig: TenantGuardrailsInput | null | undefined,
  text: string,
): { triggered: boolean; reason?: string } {
  if (!tenantConfig) return { triggered: false };
  const lowerText = text.toLowerCase();
  for (const trigger of tenantConfig.escalationTriggers) {
    if (trigger && lowerText.includes(trigger.toLowerCase())) {
      return { triggered: true, reason: `input matched tenant-configured escalation trigger: "${trigger}"` };
    }
  }
  return { triggered: false };
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
export function validateOutput(
  text: string,
  tier: "comment" | "dm",
  allowedLink?: string,
  tenantConfig?: TenantGuardrailsInput | null,
): OutputValidation {
  for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: `output matched forbidden pattern: ${pattern}` };
    }
  }

  // Phase 2C Client Guardrails: additive only — this can reject a reply
  // the global checks above would have allowed, but it can never un-reject
  // one of those (tenantConfig is consulted only here, after every global
  // check has already run and passed).
  if (tenantConfig) {
    const lowerText = text.toLowerCase();
    for (const topic of tenantConfig.forbiddenTopics) {
      if (topic && lowerText.includes(topic.toLowerCase())) {
        return { allowed: false, reason: `output matched tenant-configured forbidden topic: "${topic}"` };
      }
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
  if (tier === "dm" && text.length > MAX_DM_REPLY_LENGTH) {
    return { allowed: false, reason: `dm reply exceeds ${MAX_DM_REPLY_LENGTH} chars (Instagram's own API limit)` };
  }

  return { allowed: true };
}
