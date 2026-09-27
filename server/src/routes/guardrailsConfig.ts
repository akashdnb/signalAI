import { Router } from "express";
import { getPool } from "../db/pool.js";
import { getGuardrailsConfig, upsertGuardrailsConfig } from "../db/guardrailsConfig.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { classifyInput } from "../lib/guardrails.js";

const MAX_BRAND_VOICE_LENGTH = 2000;
const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;

function validateStringList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array of strings`);
  if (value.length > MAX_LIST_ITEMS) throw new Error(`${fieldName} must have at most ${MAX_LIST_ITEMS} entries`);
  return value.map((item, i) => {
    if (typeof item !== "string" || !item.trim()) throw new Error(`${fieldName}[${i}] must be a non-empty string`);
    if (item.length > MAX_ITEM_LENGTH) throw new Error(`${fieldName}[${i}] must be at most ${MAX_ITEM_LENGTH} characters`);
    return item.trim();
  });
}

/** Phase 2C Client Guardrails: onboarding-configured, per-tenant narrowing (brand voice, forbidden topics, escalation triggers) on top of Phase 1's Global Guardrails. This route is a plain data store — see lib/guardrails.ts for why it can never disable or loosen the global checks. */
export const guardrailsConfigRouter = Router();

guardrailsConfigRouter.use("/tenants/:tenantId", requireTenantSession);

guardrailsConfigRouter.get("/tenants/:tenantId/guardrails-config", async (req, res) => {
  const config = await getGuardrailsConfig(getPool(), req.params.tenantId!);
  // An absent config is a normal, common state (nothing configured yet),
  // not a 404 — the client should render an empty form, not an error page.
  return res.status(200).json({
    config: config ?? { tenantId: req.params.tenantId, brandVoice: null, forbiddenTopics: [], escalationTriggers: [] },
  });
});

guardrailsConfigRouter.put("/tenants/:tenantId/guardrails-config", async (req, res) => {
  const brandVoice = req.body?.brandVoice;
  if (brandVoice !== null && brandVoice !== undefined && typeof brandVoice !== "string") {
    return res.status(400).json({ error: "brandVoice must be a string or null" });
  }
  if (typeof brandVoice === "string" && brandVoice.length > MAX_BRAND_VOICE_LENGTH) {
    return res.status(400).json({ error: `brandVoice must be at most ${MAX_BRAND_VOICE_LENGTH} characters` });
  }
  // Write-time half of the same R3-03 protection milestones.ts applies to
  // goalDescription: brandVoice lands in the LLM's instruction channel
  // (replyEngine.ts/milestoneEngine.ts buildSystemPrompt) — cheaper to
  // reject obviously instruction-shaped text now than after it's live.
  if (typeof brandVoice === "string" && classifyInput(brandVoice).blocked) {
    return res.status(400).json({ error: "brandVoice looks like an attempt to inject instructions, not a description of tone" });
  }

  try {
    const forbiddenTopics = validateStringList(req.body?.forbiddenTopics ?? [], "forbiddenTopics");
    const escalationTriggers = validateStringList(req.body?.escalationTriggers ?? [], "escalationTriggers");

    const config = await upsertGuardrailsConfig(getPool(), {
      tenantId: req.params.tenantId!,
      brandVoice: brandVoice ?? null,
      forbiddenTopics,
      escalationTriggers,
    });
    return res.status(200).json({ config });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});
