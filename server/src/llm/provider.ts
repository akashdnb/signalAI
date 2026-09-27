/**
 * systemPrompt (trusted, built by our code) and userMessage (untrusted —
 * the raw comment/DM text) are separate fields, never concatenated into
 * one string, and every provider implementation must map them to separate
 * roles in the underlying API call. This is the structural half of
 * untrusted-input isolation (roadmap Security Foundations); classifyInput/
 * validateOutput in lib/guardrails.ts are the other half.
 */
export interface GenerateReplyInput {
  systemPrompt: string;
  userMessage: string;
  /**
   * R3-07 fix: the Milestone Engine was requesting structured output in
   * prose and recovering it with a regex, leaving the provider's native
   * JSON mode — the actual reason Tech Stack picked a provider on
   * "structured-output / tool-calling reliability" — unused. A provider
   * that doesn't support this can ignore it; the regex recovery stays as
   * the fallback either way.
   */
  responseFormat?: "json_object";
}

/** Phase 2B Per-Tenant Usage Ledger: token counts, when the provider reports them, so a real (not estimated) figure can be billed. Absent for a provider/response that doesn't report usage — callers must treat this as best-effort, not guaranteed. */
export interface GenerateReplyUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerateReplyResult {
  text: string;
  usage?: GenerateReplyUsage;
}

export interface LLMProvider {
  readonly name: string;
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
