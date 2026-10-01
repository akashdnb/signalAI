import type { Pool } from "pg";
import { getCapturedFacts } from "../db/capturedFacts.js";
import {
  getLeadIntelligence,
  upsertLeadIntelligence,
  type LeadScoreBand,
  type LeadIntelligence,
} from "../db/leadIntelligence.js";

const NEED_WEIGHT = 20;
const BUDGET_WEIGHT = 20;
const LOCATION_WEIGHT = 10;
const ENGAGEMENT_MAX_WEIGHT = 15;
const MILESTONE_PROGRESS_MAX_WEIGHT = 10;

const INTENT_WEIGHTS: Record<string, number> = {
  ready_to_buy: 25,
  high_intent: 25,
  considering: 15,
  researching: 5,
  not_interested: 0,
  support: 0,
};

const INTENT_KEYS = [
  "intent",
  "lead_intent",
  "purchase_intent",
];

const NEED_KEYS = [
  "need",
  "lead_need",
  "requirement",
  "use_case",
];

const BUDGET_KEYS = [
  "budget",
  "budget_range",
  "budget_amount",
];

const LOCATION_KEYS = [
  "location",
  "city",
  "country",
  "preferred_location",
];

function firstNonEmptyFact(
  facts: Record<string, string>,
  keys: string[],
): string | null {
  const entries = Object.entries(facts);

  for (const key of keys) {
    const match = entries.find(
      ([factKey, value]) =>
        factKey.toLowerCase() === key &&
        typeof value === "string" &&
        value.trim().length > 0,
    );

    if (match) return match[1].trim();
  }

  return null;
}

const INTENT_ALIASES: Record<string, string> = {
  buying: "ready_to_buy",
  buy: "ready_to_buy",
  purchase: "ready_to_buy",
  purchasing: "ready_to_buy",
  ready: "ready_to_buy",
  "ready to buy": "ready_to_buy",
  "ready-to-buy": "ready_to_buy",
  interested: "high_intent",
  "high intent": "high_intent",
  "high-intent": "high_intent",
  evaluating: "considering",
  "still deciding": "considering",
  exploring: "researching",
  exploring_options: "researching",
  "just researching": "researching",
  disinterested: "not_interested",
  "not interested": "not_interested",
  support_request: "support",
};

function normalizeIntent(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\\s-]+/g, "_");

  return INTENT_ALIASES[normalized] ?? normalized;
}

function parseBudgetValue(value: string | null): number | null {
  if (!value) return null;

  const normalized = value
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/₹/g, "")
    .replace(/inr|rs\.?/g, "")
    .trim();

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const match = normalized.match(/^(\d+(\.\d+)?)\s*(crore|cr|lakh|lac|k)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const multiplier =
    match[3] === "crore" || match[3] === "cr"
      ? 10_000_000
      : match[3] === "lakh" || match[3] === "lac"
        ? 100_000
        : 1_000;

  return amount * multiplier;
}

export interface LeadScoreResult {
  score: number;
  scoreBand: LeadScoreBand;
  reasons: string[];
}

export function calculateLeadScore(input: {
  intent?: string | null;
  need?: string | null;
  budget?: string | null;
  location?: string | null;
  inboundEventsLast7Days: number;
  milestonesAdvanced: number;
}): LeadScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const normalizedIntent = normalizeIntent(input.intent);
  if (normalizedIntent) {
    const intentPoints = INTENT_WEIGHTS[normalizedIntent];

    if (intentPoints !== undefined && intentPoints > 0) {
      score += intentPoints;
      reasons.push(`Intent ${normalizedIntent} +${intentPoints}`);
    }
  }

  if (input.need?.trim()) {
    score += NEED_WEIGHT;
    reasons.push(`Need captured +${NEED_WEIGHT}`);
  }

  if (input.budget?.trim()) {
    score += BUDGET_WEIGHT;
    reasons.push(`Budget captured +${BUDGET_WEIGHT}`);
  }

  if (input.location?.trim()) {
    score += LOCATION_WEIGHT;
    reasons.push(`Location captured +${LOCATION_WEIGHT}`);
  }

  const engagementPoints = Math.min(
    Math.max(0, input.inboundEventsLast7Days) * 3,
    ENGAGEMENT_MAX_WEIGHT,
  );

  if (engagementPoints > 0) {
    score += engagementPoints;
    reasons.push(`Recent engagement +${engagementPoints}`);
  }

  const progressPoints = Math.min(
    Math.max(0, input.milestonesAdvanced) * 2,
    MILESTONE_PROGRESS_MAX_WEIGHT,
  );

  if (progressPoints > 0) {
    score += progressPoints;
    reasons.push(`Milestone progress +${progressPoints}`);
  }

  score = Math.min(100, score);

  let scoreBand: LeadScoreBand = "cold";

  if (score >= 80) {
    scoreBand = "very_hot";
  } else if (score >= 60) {
    scoreBand = "hot";
  } else if (score >= 30) {
    scoreBand = "warm";
  }

  return {
    score,
    scoreBand,
    reasons,
  };
}

export async function recalculateLeadIntelligence(
  pool: Pool,
  tenantId: string,
  leadId: string,
): Promise<LeadIntelligence> {
  const facts = await getCapturedFacts(pool, tenantId, leadId);

  const intent = firstNonEmptyFact(facts, INTENT_KEYS);
  const need = firstNonEmptyFact(facts, NEED_KEYS);
  const budget = firstNonEmptyFact(facts, BUDGET_KEYS);
  const location = firstNonEmptyFact(facts, LOCATION_KEYS);

  const engagementResult = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from lead_events
      where tenant_id = $1
        and lead_id = $2
        and occurred_at >= now() - interval '7 days'
        and event_type = 'message'`,
    [tenantId, leadId],
  );

  const milestoneResult = await pool.query<{ count: string }>(
    `select count(distinct milestone_id)::text as count
       from milestone_advancements
      where tenant_id = $1
        and lead_id = $2`,
    [tenantId, leadId],
  );

  const scoring = calculateLeadScore({
    intent,
    need,
    budget,
    location,
    inboundEventsLast7Days: Number(engagementResult.rows[0]?.count ?? "0"),
    milestonesAdvanced: Number(milestoneResult.rows[0]?.count ?? "0"),
  });

  return upsertLeadIntelligence(pool, {
    tenantId,
    leadId,
    intent,
    need,
    budgetValue: parseBudgetValue(budget),
    budgetText: budget,
    location,
    score: scoring.score,
    scoreBand: scoring.scoreBand,
    scoreReasons: scoring.reasons,
  });
}
