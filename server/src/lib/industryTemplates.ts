import type { TenantIndustry } from "../db/tenants.js";
import type { FieldDefinitionValueType } from "../db/fieldDefinitions.js";

export interface IndustryTemplate {
  fieldDefinitions: Array<{ fieldKey: string; label: string; valueType: FieldDefinitionValueType }>;
  campaign: {
    name: string;
    keywords: string[];
    milestones: Array<{ goalDescription: string; captureFields?: string[] }>;
  };
}

/**
 * Onboarding wizard (R5) starter scaffolding — applied once, when a tenant
 * picks their business type, via routes/onboarding.ts. `null` for 'other':
 * same blank slate as every tenant got before this feature existed.
 */
export const INDUSTRY_TEMPLATES: Record<TenantIndustry, IndustryTemplate | null> = {
  real_estate: {
    fieldDefinitions: [
      { fieldKey: "budget", label: "Budget", valueType: "number" },
      { fieldKey: "location", label: "Preferred Location", valueType: "text" },
      { fieldKey: "configuration", label: "Configuration", valueType: "text" },
      { fieldKey: "timeline", label: "Buying Timeline", valueType: "text" },
    ],
    campaign: {
      name: "Property Enquiry",
      keywords: ["PRICE", "DETAILS"],
      milestones: [
        { goalDescription: "Ask which property or project they're interested in" },
        { goalDescription: "Capture their budget and preferred location", captureFields: ["budget", "location"] },
        { goalDescription: "Ask their buying timeline", captureFields: ["timeline"] },
        { goalDescription: "Offer to schedule a site visit" },
      ],
    },
  },
  ecommerce: {
    fieldDefinitions: [
      { fieldKey: "product_interest", label: "Product Interest", valueType: "text" },
      { fieldKey: "order_id", label: "Order ID", valueType: "text" },
    ],
    campaign: {
      name: "Product Enquiry",
      keywords: ["PRICE", "LINK"],
      milestones: [
        { goalDescription: "Capture which product they're asking about", captureFields: ["product_interest"] },
        { goalDescription: "Offer to share the purchase link" },
      ],
    },
  },
  education: {
    fieldDefinitions: [
      { fieldKey: "course_interest", label: "Course Interest", valueType: "text" },
      { fieldKey: "preferred_batch", label: "Preferred Batch", valueType: "text" },
    ],
    campaign: {
      name: "Course Enquiry",
      keywords: ["ENROLL", "DETAILS"],
      milestones: [
        { goalDescription: "Capture which course they're interested in", captureFields: ["course_interest"] },
        { goalDescription: "Capture their preferred batch or timing", captureFields: ["preferred_batch"] },
        { goalDescription: "Offer a callback or demo" },
      ],
    },
  },
  creator: {
    fieldDefinitions: [{ fieldKey: "collab_interest", label: "Collab Interest", valueType: "text" }],
    campaign: {
      name: "Collab Enquiry",
      keywords: ["COLLAB", "INFO"],
      milestones: [
        { goalDescription: "Capture what kind of collaboration they're looking for", captureFields: ["collab_interest"] },
        { goalDescription: "Share the media kit or rate card link" },
      ],
    },
  },
  coach: {
    fieldDefinitions: [
      { fieldKey: "goal_interest", label: "Main Goal", valueType: "text" },
      { fieldKey: "preferred_call_time", label: "Preferred Call Time", valueType: "text" },
    ],
    campaign: {
      name: "Coaching Enquiry",
      keywords: ["COACHING", "INFO"],
      milestones: [
        { goalDescription: "Capture their main goal", captureFields: ["goal_interest"] },
        { goalDescription: "Capture their preferred call time", captureFields: ["preferred_call_time"] },
        { goalDescription: "Offer a discovery call" },
      ],
    },
  },
  agency: {
    fieldDefinitions: [
      { fieldKey: "company_name", label: "Company Name", valueType: "text" },
      { fieldKey: "budget", label: "Budget", valueType: "number" },
    ],
    campaign: {
      name: "Service Enquiry",
      keywords: ["INFO", "QUOTE"],
      milestones: [
        { goalDescription: "Capture their company name", captureFields: ["company_name"] },
        { goalDescription: "Capture their budget", captureFields: ["budget"] },
        { goalDescription: "Offer a call or proposal" },
      ],
    },
  },
  other: null,
};
