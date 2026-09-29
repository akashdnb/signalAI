import { Router } from "express";
import { getPool } from "../db/pool.js";
import { setTenantIndustry, type TenantIndustry } from "../db/tenants.js";
import { listFieldDefinitions, createFieldDefinition } from "../db/fieldDefinitions.js";
import { createCampaign } from "../db/campaigns.js";
import { setCampaignMilestones } from "../db/milestones.js";
import { INDUSTRY_TEMPLATES } from "../lib/industryTemplates.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

export const onboardingRouter = Router();

onboardingRouter.use("/tenants/:tenantId", requireTenantSession);

const VALID_INDUSTRIES: TenantIndustry[] = [
  "real_estate",
  "ecommerce",
  "education",
  "creator",
  "coach",
  "agency",
  "other",
];

/**
 * Onboarding wizard (R5) step 2: persists the chosen vertical, then
 * scaffolds a starter field-definition set + one starter campaign (with
 * milestones) matched to it — real content, not just a UI flourish. Field
 * definitions are created idempotently by fieldKey (a tenant that already
 * registered one manually before finishing onboarding keeps their own);
 * the starter campaign is always created fresh (a brand-new tenant never
 * has one yet in practice).
 */
onboardingRouter.post("/tenants/:tenantId/onboarding/apply-industry", async (req, res) => {
  const { tenantId } = req.params;
  const { industry } = req.body ?? {};
  if (!VALID_INDUSTRIES.includes(industry)) {
    return res.status(400).json({ error: `industry must be one of ${VALID_INDUSTRIES.join(", ")}` });
  }

  const pool = getPool();
  const tenant = await setTenantIndustry(pool, tenantId, industry as TenantIndustry);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });

  const template = INDUSTRY_TEMPLATES[industry as TenantIndustry];
  if (template) {
    const existing = await listFieldDefinitions(pool, tenantId);
    const existingKeys = new Set(existing.map((f) => f.fieldKey));
    for (const field of template.fieldDefinitions) {
      if (!existingKeys.has(field.fieldKey)) {
        await createFieldDefinition(pool, tenantId, field);
      }
    }

    const campaign = await createCampaign(pool, tenantId, template.campaign.name, template.campaign.keywords);
    await setCampaignMilestones(pool, tenantId, campaign.id, template.campaign.milestones);
  }

  return res.status(200).json(tenant);
});
