/**
 * Shared by both reply engines, owned by neither (roadmap B7): rule-based
 * replies ARE templates; AI replies still render into one for the CTA
 * link. Built once, under the reply layer.
 */
export interface TemplateVariables {
  username?: string;
  keyword?: string;
  ctaLink?: string;
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template
    .replace(/\{\{\s*username\s*\}\}/g, variables.username ?? "there")
    .replace(/\{\{\s*keyword\s*\}\}/g, variables.keyword ?? "");

  if (variables.ctaLink) {
    rendered = `${rendered.trim()} ${variables.ctaLink}`;
  }

  return rendered.trim();
}
