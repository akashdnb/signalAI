const BUILT_IN_CAPTURE_FIELD_LABELS: Record<string, string> = {
  intent: "Intent",
  need: "What they need",
  email: "Email address",
  phone: "Phone number",
};

export function formatCaptureFieldLabel(fieldKey: string): string {
  return BUILT_IN_CAPTURE_FIELD_LABELS[fieldKey] ??
    fieldKey.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
