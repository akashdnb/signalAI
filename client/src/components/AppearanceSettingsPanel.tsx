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

/** Uses the real local theme/palette preference support; no preview-only persistence is introduced. */
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
    <section className="card settings-panel settings-appearance-panel">
      <div className="settings-panel-header">
        <div>
          <div className="settings-eyebrow">PERSONAL PREFERENCES</div>
          <h2>Appearance</h2>
          <p className="muted small">Choose a theme and accent palette for your SignalAI workspace.</p>
        </div>
      </div>

      <div className="settings-appearance-section">
        <h3>Theme mode</h3>
        <p className="muted small">Switch between light and dark surfaces.</p>
        <div className="settings-theme-grid" role="radiogroup" aria-label="Theme mode">
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
                className={`settings-choice-card${selected ? " is-selected" : ""}`}
              >
                <span className="settings-choice-icon"><Icon /></span>
                <span>
                  <span className="settings-choice-title">{option.label}</span>
                  <span className="settings-choice-description">{option.description}</span>
                </span>
                {selected && <CheckCircleIcon className="settings-choice-check" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-appearance-section">
        <h3>Accent palette</h3>
        <p className="muted small">Applies across navigation, actions, selected items, and charts.</p>
        <div className="settings-palette-grid" role="radiogroup" aria-label="Accent palette">
          {PALETTE_OPTIONS.map((option) => {
            const selected = palette === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choosePalette(option.value)}
                className={`settings-palette-card${selected ? " is-selected" : ""}`}
              >
                <span className="settings-palette-swatches" aria-hidden="true">
                  {option.swatches.map((color, i) => <span key={i} style={{ backgroundColor: color }} />)}
                </span>
                <span>
                  <span className="settings-choice-title">{option.label}</span>
                  <span className="settings-choice-description">{option.description}</span>
                </span>
                {selected && <CheckCircleIcon className="settings-choice-check" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
