import type { CampaignLanguage, CampaignTone } from "../db/campaigns.js";

/** Shared by replyEngine.ts and milestoneEngine.ts's buildSystemPrompt — one wording per tone/language value so the two engines can't drift apart on what "friendly" or "hi" actually instructs the model to do. */
const TONE_INSTRUCTION: Record<CampaignTone, string> = {
  professional: "Use a professional, businesslike tone.",
  friendly: "Use a warm, casual, friendly tone.",
  casual: "Use a relaxed, casual, conversational tone.",
  professional_and_friendly: "Use a professional yet friendly and approachable tone.",
};

const LANGUAGE_NAME: Record<Exclude<CampaignLanguage, "auto">, string> = {
  en: "English",
  hi: "Hindi",
};

export function toneInstruction(tone: CampaignTone): string {
  return TONE_INSTRUCTION[tone];
}

/** null for 'auto' — leaves reply language unspecified, identical to every pre-R3 campaign's behavior. */
export function languageInstruction(language: CampaignLanguage): string | null {
  if (language === "auto") return null;
  return `Always reply in ${LANGUAGE_NAME[language]}, regardless of what language the user writes in.`;
}
