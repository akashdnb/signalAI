/**
 * Accent palette (Settings -> Appearance): ports the preview's
 * `data-po-palette` switcher as a real, persisted choice (`data-palette` on
 * `<html>`, see index.css's `[data-palette="..."]` overrides), not a
 * decorative mock. Unlike theme.ts's three-state "follow the OS" model,
 * there's no system accent preference to fall back to, so an explicit
 * default ("navy-cobalt", matching the preview's own default) always
 * applies rather than leaving the choice unset.
 */
export type AccentPalette =
  | "navy-cobalt"
  | "teal-emerald"
  | "slate-cyan"
  | "forest-slate"
  | "orange-amber"
  | "neutral-slate"
  | "ocean-sky"
  | "jade-mint"
  | "rose-slate"
  | "amber-graphite";

export interface PaletteOption {
  value: AccentPalette;
  label: string;
  description: string;
  /** [primary, hover, light-accent, soft-tint] — the preview's own swatch order for the picker card. */
  swatches: readonly [string, string, string, string];
}

export const PALETTE_OPTIONS: readonly PaletteOption[] = [
  { value: "navy-cobalt", label: "Navy & Cobalt", description: "Clear, confident blue", swatches: ["#1e3a8a", "#2563eb", "#60a5fa", "#eff6ff"] },
  { value: "teal-emerald", label: "Teal & Emerald", description: "Calm and approachable", swatches: ["#065f4a", "#10b981", "#34d399", "#ecfdf5"] },
  { value: "slate-cyan", label: "Slate & Cyan", description: "Neutral with a crisp accent", swatches: ["#0f172a", "#06b6d4", "#22d3ee", "#e0f2fe"] },
  { value: "forest-slate", label: "Forest & Slate", description: "Grounded green", swatches: ["#14532d", "#16a34a", "#86efac", "#f0fdf4"] },
  { value: "orange-amber", label: "Orange & Amber", description: "Warm and energetic", swatches: ["#c2410c", "#f97316", "#fdba74", "#fff7ed"] },
  { value: "neutral-slate", label: "Neutral Slate", description: "Low-colour and understated", swatches: ["#334155", "#475569", "#94a3b8", "#f1f5f9"] },
  { value: "ocean-sky", label: "Ocean & Sky", description: "Deep blue with a clear sky accent", swatches: ["#075985", "#0284c7", "#38bdf8", "#e0f2fe"] },
  { value: "jade-mint", label: "Jade & Mint", description: "Fresh green with mint highlights", swatches: ["#065f46", "#10b981", "#6ee7b7", "#d1fae5"] },
  { value: "rose-slate", label: "Rose & Slate", description: "Warm rose on a cool neutral base", swatches: ["#9f1239", "#e11d48", "#fb7185", "#fff1f2"] },
  { value: "amber-graphite", label: "Amber & Graphite", description: "Warm accent on charcoal neutrals", swatches: ["#78350f", "#d97706", "#fbbf24", "#fffbeb"] },
];

export const DEFAULT_PALETTE: AccentPalette = "navy-cobalt";

const PALETTE_KEY = "signalai.palette";
const PALETTE_VALUES = new Set<string>(PALETTE_OPTIONS.map((p) => p.value));

function isAccentPalette(value: string): value is AccentPalette {
  return PALETTE_VALUES.has(value);
}

export function getStoredPalette(): AccentPalette | null {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    return raw && isAccentPalette(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function applyPalette(palette: AccentPalette): void {
  document.documentElement.setAttribute("data-palette", palette);
}

export function storePalette(palette: AccentPalette): void {
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    // Storage unavailable (private browsing, quota) — still applies for this page load via applyPalette.
  }
}
