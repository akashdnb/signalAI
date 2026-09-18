/**
 * Global Guardrails (roadmap Phase 1 Reply Engine / Security Foundations):
 * platform-owned, non-overridable. [[Phase 2C]]'s Client Guardrails layer
 * on top of this and can only narrow it, never override it — so this
 * module must never take per-tenant configuration as an input that could
 * disable a check.
 *
 * Two passes around the LLM call, not one: a system prompt saying "don't
 * do X" is a suggestion the model can be talked around. Input
 * classification and output validation are the actual enforcement.
 */

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all|any|the)? ?(previous|prior|above) instructions/i,
  /you are now/i,
  /system\s*:/i,
  /disregard (all|any|the)? ?(previous|prior|above)/i,
  /act as (an?|the)/i,
  /new instructions/i,
];

const FORBIDDEN_OUTPUT_PATTERNS = [
  // Global guardrails: no medical/legal/financial advice (roadmap).
  /\bI recommend (taking|this) (medication|drug|prescription)/i,
  /\byou should (sue|file a lawsuit)/i,
  /\bguaranteed (returns|profit|income)/i,
];

const MAX_COMMENT_REPLY_LENGTH = 300; // public comment replies: short/constrained, higher guardrail strictness

export interface InputClassification {
  blocked: boolean;
  reason?: string;
}

/**
 * Runs BEFORE generation. Comment/DM text is attacker-controlled input
 * flowing into a prompt whose output can post publicly under the client's
 * brand — this is what catches an attempted prompt injection before it
 * ever reaches the model, rather than hoping the model resists it.
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
 * looked benign — the real safety net, not the system prompt.
 */
export function validateOutput(text: string, tier: "comment" | "dm"): OutputValidation {
  for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: `output matched forbidden pattern: ${pattern}` };
    }
  }

  if (tier === "comment" && text.length > MAX_COMMENT_REPLY_LENGTH) {
    return { allowed: false, reason: `comment reply exceeds ${MAX_COMMENT_REPLY_LENGTH} chars` };
  }

  return { allowed: true };
}
