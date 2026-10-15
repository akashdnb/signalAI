/**
 * Agency Workspaces: validation for the two user-editable workspace display
 * fields, `name` and `description`.
 *
 * Both render in the BUI header, in every workspace listing (the switcher),
 * and anywhere a workspace name/description gets logged — none of it
 * scrubbable the way lead_pii is (R14-05). So the rules here are deliberately
 * conservative: trim, length-cap, and reject anything that looks like an
 * email address, the most common way personal data leaks into a free-text
 * display field. This is a guard against accidental PII, not a general
 * profanity/validation engine.
 */

export const WORKSPACE_NAME_MAX = 80;
export const WORKSPACE_DESCRIPTION_MAX = 280;

// Intentionally loose: any run that reads as an email address. We only need
// to catch the obvious "put my client's email in the workspace name" case.
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Required. Returns the trimmed name or a caller-facing error message. */
export function validateWorkspaceName(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "name is required" };
  }
  const trimmed = value.trim();
  if (trimmed.length > WORKSPACE_NAME_MAX) {
    return { ok: false, error: `name must be at most ${WORKSPACE_NAME_MAX} characters` };
  }
  if (EMAIL_LIKE.test(trimmed)) {
    return { ok: false, error: "name must not contain an email address" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Optional. `null` and `""` both clear the description (normalized to null);
 * a non-empty string is trimmed, length-capped, and PII-guarded like the name.
 */
export function validateWorkspaceDescription(value: unknown): ValidationResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: "description must be a string" };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > WORKSPACE_DESCRIPTION_MAX) {
    return { ok: false, error: `description must be at most ${WORKSPACE_DESCRIPTION_MAX} characters` };
  }
  if (EMAIL_LIKE.test(trimmed)) {
    return { ok: false, error: "description must not contain an email address" };
  }
  return { ok: true, value: trimmed };
}
