/**
 * Shared by both reply engines, owned by neither (roadmap B7): rule-based
 * replies use templates; AI replies get the CTA appended directly rather
 * than run through the same substitution (R2-07 review fix — rendering
 * model output as a template served no purpose and risked silently
 * eating a literal "{{keyword}}" the model happened to emit).
 */
export interface TemplateVariables {
  username?: string;
  keyword?: string;
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template
    .replace(/\{\{\s*username\s*\}\}/g, variables.username ?? "there")
    .replace(/\{\{\s*keyword\s*\}\}/g, variables.keyword ?? "")
    .trim();
}

/**
 * Appends the CTA link as the final compose step, after any template
 * substitution — R2-01 review fix: guardrail length validation must run
 * AFTER this, not before, or a reply that validates at 299 characters can
 * still ship over the comment-tier limit once the link is added.
 */
export function appendCtaLink(text: string, ctaLink?: string): string {
  if (!ctaLink) return text.trim();
  return `${text.trim()} ${ctaLink}`.trim();
}
