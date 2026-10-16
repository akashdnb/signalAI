import { useState } from "react";
import { CheckCircleIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { applySystemTheme, applyTheme, clearStoredTheme, getStoredTheme, storeTheme, type Theme } from "../lib/theme";
import { applyPalette, DEFAULT_PALETTE, getStoredPalette, PALETTE_OPTIONS, storePalette, type AccentPalette } from "../lib/palette";

type ThemeChoice = Theme | "system";

const THEME_OPTIONS: { value: ThemeChoice; label: string; description: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", description: "Bright surfaces", icon: SunIcon },
  { value: "dark", label: "Dark", description: "Reduced luminance", icon: MoonIcon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: MonitorIcon },
];

/**
 * Matches the preview's Appearance screen: a Theme mode card row (the
 * preview only has Light/Dark — System is a genuine extra production has,
 * since lib/theme.ts already modeled "no stored pick -> follow the OS" and
 * no control could reach it before) plus the real 10-option accent palette
 * picker (lib/palette.ts), both as selectable bordered cards instead of a
 * plain segmented button.
 */
export function AppearanceSettingsPanel() {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => getStoredTheme() ?? "system");
  const [palette, setPalette] = useState<AccentPalette>(() => getStoredPalette() ?? DEFAULT_PALETTE);

  function chooseTheme(next: ThemeChoice) {
    setThemeChoice(next);
    if (next === "system") {
      clearStoredTheme();
      applySystemTheme();
    } else {
      storeTheme(next);
      applyTheme(next);
    }
  }

  function choosePalette(next: AccentPalette) {
    setPalette(next);
    storePalette(next);
    applyPalette(next);
  }

  return (
    <section className="card">
      <h2>Appearance</h2>
      <p className="muted small">Choose a theme and accent palette for this workspace.</p>

      <div className="mt-5">
        <h3 className="m-0 text-sm font-semibold text-ink">Theme mode</h3>
        <p className="muted small mt-0.5">Switch between light and dark surfaces.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme mode">
          {THEME_OPTIONS.map((option) => {
            const selected = themeChoice === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseTheme(option.value)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  selected ? "border-accent bg-chip" : "border-line bg-card hover:border-accent-soft"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4.5 w-4.5 shrink-0 text-ink" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{option.label}</span>
                    <span className="block text-xs text-subtle">{option.description}</span>
                  </span>
                </span>
                {selected && <CheckCircleIcon className="h-5 w-5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="m-0 text-sm font-semibold text-ink">Accent palette</h3>
        <p className="muted small mt-0.5">Applies across navigation, actions, selected items, and charts.</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Accent palette">
          {PALETTE_OPTIONS.map((option) => {
            const selected = palette === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choosePalette(option.value)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  selected ? "border-accent bg-chip" : "border-line bg-card hover:border-accent-soft"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex shrink-0 overflow-hidden rounded-md" aria-hidden="true">
                    {option.swatches.map((color, i) => (
                      <span key={i} className="block h-6 w-2" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{option.label}</span>
                    <span className="block text-xs text-subtle">{option.description}</span>
                  </span>
                </span>
                {selected && <CheckCircleIcon className="h-5 w-5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
