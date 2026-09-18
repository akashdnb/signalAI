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
}

export interface LLMProvider {
  readonly name: string;
  generateReply(input: GenerateReplyInput): Promise<string>;
}
