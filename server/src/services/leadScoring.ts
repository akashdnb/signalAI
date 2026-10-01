import type { Pool } from "pg";
import { getCapturedFacts } from "../db/capturedFacts.js";
import {
  getLeadIntelligence,
  upsertLeadIntelligence,
  type LeadScoreBand,
  type LeadIntelligence,
} from "../db/leadIntelligence.js";
import { listScoringRules, type LeadScoringRule, type ScoringRuleDefinition } from "../db/leadScoringRules.js";

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

export function parseBudgetValue(value: string | null): number | null {
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

  const match = normalized.match(/^(\d+(\.\d+)?)\s*(crore|cr|lakh|lac|l|k)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const multiplier =
    match[3] === "crore" || match[3] === "cr"
      ? 10_000_000
      : match[3] === "lakh" || match[3] === "lac" || match[3] === "l"
        ? 100_000
        : 1_000;

  return amount * multiplier;
}

export interface LeadScoreResult {
  score: number;
  scoreBand: LeadScoreBand;
  reasons: string[];
}

function scoreBandFor(score: number): LeadScoreBand {
  if (score >= 80) return "very_hot";
  if (score >= 60) return "hot";
  if (score >= 30) return "warm";
  return "cold";
}

/**
 * Evaluates a single tenant-configured rule against the current scoring
 * context. Returns the points to apply, or null when the rule doesn't
 * match (or is malformed) — a malformed rule fails safe by simply not
 * applying, never by throwing and breaking the deterministic base score.
 */
function evaluateScoringRule(
  definition: ScoringRuleDefinition,
  context: { budgetValue: number | null; intent: string | null; need: string | null; location: string | null; completedMilestoneIds: Set<string> },
): boolean {
  try {
    if (definition.kind === "milestone_completed") {
      return context.completedMilestoneIds.has(definition.milestoneId);
    }

    if (definition.kind === "field_compare") {
      const fieldValue: number | string | null =
        definition.field === "budget_value"
          ? context.budgetValue
          : definition.field === "intent"
            ? context.intent
            : definition.field === "need"
              ? context.need
              : context.location;

      if (definition.operator === "exists") {
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
      }

      if (fieldValue === null || fieldValue === undefined || definition.value === undefined) return false;

      if (typeof fieldValue === "number" && typeof definition.value === "number") {
        if (definition.operator === "gte") return fieldValue >= definition.value;
        if (definition.operator === "lte") return fieldValue <= definition.value;
        return fieldValue === definition.value;
      }

      // String fields only support equality — gte/lte on a string value has
      // no safe deterministic meaning here, so it simply never matches.
      if (typeof fieldValue === "string" && typeof definition.value === "string") {
        return definition.operator === "eq" && fieldValue.toLowerCase() === definition.value.toLowerCase();
      }

      return false;
    }

    return false;
  } catch {
    // A malformed/unexpected rule shape must never crash scoring — it just
    // contributes nothing, same as "doesn't match."
    return false;
  }
}

/**
 * Applies tenant-configured custom scoring rules on top of the
 * deterministic base score (SLICE C). Every applied rule is named in
 * reasons; the clamp to [0, 100] happens once at the end, after both base
 * and custom points are summed, so custom rules can push the score up OR
 * down without ever producing an out-of-range result.
 */
function applyCustomScoringRules(
  baseScore: number,
  reasons: string[],
  rules: LeadScoringRule[],
  context: { budgetValue: number | null; intent: string | null; need: string | null; location: string | null; completedMilestoneIds: Set<string> },
): LeadScoreResult {
  let score = baseScore;
  const allReasons = [...reasons];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateScoringRule(rule.definition, context)) continue;

    score += rule.points;
    const sign = rule.points >= 0 ? "+" : "";
    allReasons.push(`Rule "${rule.name}" ${sign}${rule.points}`);
  }

  score = Math.max(0, Math.min(100, score));

  return { score, scoreBand: scoreBandFor(score), reasons: allReasons };
}

export function calculateLeadScore(input: {
  intent?: string | null;
  need?: string | null;
  budget?: string | null;
  location?: string | null;
  inboundEventsLast7Days: number;
  milestonesAdvanced: number;
  /** SLICE C: tenant-configured custom scoring rules, applied deterministically on top of the base score. Omitted (the default) preserves the exact pre-SLICE-C behavior. */
  customRules?: LeadScoringRule[];
  /** Distinct milestone ids this lead has completed — only needed when customRules includes a "milestone_completed" rule. */
  completedMilestoneIds?: Set<string>;
  /** The numeric budget value already parsed from `budget` — passed separately since calculateLeadScore itself never parses budget text. */
  budgetValue?: number | null;
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

  if (input.customRules && input.customRules.length > 0) {
    return applyCustomScoringRules(score, reasons, input.customRules, {
      budgetValue: input.budgetValue ?? null,
      intent: normalizedIntent,
      need: input.need?.trim() || null,
      location: input.location?.trim() || null,
      completedMilestoneIds: input.completedMilestoneIds ?? new Set(),
    });
  }

  return {
    score,
    scoreBand: scoreBandFor(score),
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

  const milestoneResult = await pool.query<{ milestone_id: string }>(
    `select distinct milestone_id
       from milestone_advancements
      where tenant_id = $1
        and lead_id = $2`,
    [tenantId, leadId],
  );
  const completedMilestoneIds = new Set(milestoneResult.rows.map((row) => row.milestone_id));

  // SLICE C: only enabled rules are ever fetched/applied — a tenant with
  // none configured pays no extra query cost beyond this one lookup, and
  // calculateLeadScore's customRules branch is simply skipped (empty array).
  const customRules = await listScoringRules(pool, tenantId, true);
  const budgetValue = parseBudgetValue(budget);

  const scoring = calculateLeadScore({
    intent,
    need,
    budget,
    location,
    inboundEventsLast7Days: Number(engagementResult.rows[0]?.count ?? "0"),
    milestonesAdvanced: completedMilestoneIds.size,
    customRules,
    completedMilestoneIds,
    budgetValue,
  });

  return upsertLeadIntelligence(pool, {
    tenantId,
    leadId,
    intent,
    need,
    budgetValue,
    budgetText: budget,
    location,
    score: scoring.score,
    scoreBand: scoring.scoreBand,
    scoreReasons: scoring.reasons,
  });
}
