export const QUALIFICATION_INTENTS = [
  "ready_to_buy",
  "high_intent",
  "considering",
  "researching",
  "not_interested",
  "support",
] as const;

export type QualificationIntent = (typeof QUALIFICATION_INTENTS)[number];

export interface QualificationExtraction {
  intent?: QualificationIntent;
  need?: string;
  budget?: string;
  location?: string;
}

const REFUSAL_VALUES = new Set([
  "i'd rather not say",
  "rather not say",
  "prefer not to say",
  "no thanks",
  "n/a",
  "na",
  "none",
  "skip",
]);

const INTENT_ALIASES: Record<string, QualificationIntent> = {
  ready_to_buy: "ready_to_buy",
  buying_now: "ready_to_buy",
  ready_to_purchase: "ready_to_buy",
  high_intent: "high_intent",
  strong_intent: "high_intent",
  considering: "considering",
  comparing: "considering",
  evaluating: "considering",
  researching: "researching",
  browsing: "researching",
  exploring: "researching",
  not_interested: "not_interested",
  no_interest: "not_interested",
  support: "support",
  customer_support: "support",
};

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  if (REFUSAL_VALUES.has(trimmed.toLowerCase())) return undefined;

  return trimmed;
}

function normalizeIntent(value: unknown): QualificationIntent | undefined {
  if (typeof value !== "string") return undefined;

  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return INTENT_ALIASES[key];
}

export function normalizeQualification(
  raw: unknown,
): QualificationExtraction | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const value = raw as Record<string, unknown>;

  const result: QualificationExtraction = {};

  const intent = normalizeIntent(value.intent);
  const need = cleanText(value.need, 250);
  const budget = cleanText(value.budget, 100);
  const location = cleanText(value.location, 120);

  if (intent) result.intent = intent;
  if (need) result.need = need;
  if (budget) result.budget = budget;
  if (location) result.location = location;

  return Object.keys(result).length > 0 ? result : undefined;
}

export function qualificationToCapturedFacts(
  qualification: QualificationExtraction,
): Record<string, string> {
  const facts: Record<string, string> = {};

  if (qualification.intent) facts.intent = qualification.intent;
  if (qualification.need) facts.need = qualification.need;
  if (qualification.budget) facts.budget = qualification.budget;
  if (qualification.location) facts.location = qualification.location;

  return facts;
}
