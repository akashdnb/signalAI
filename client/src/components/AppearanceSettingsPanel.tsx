import { useState } from "react";
import { applySystemTheme, applyTheme, clearStoredTheme, getStoredTheme, storeTheme, type Theme } from "../lib/theme";

type ThemeChoice = Theme | "system";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** The header's ThemeToggle only ever flips between the two explicit states; this exposes the third real state (no stored pick — follow the OS) that lib/theme.ts already models but no control could reach. */
export function AppearanceSettingsPanel() {
  const [choice, setChoice] = useState<ThemeChoice>(() => getStoredTheme() ?? "system");

  function choose(next: ThemeChoice) {
    setChoice(next);
    if (next === "system") {
      clearStoredTheme();
      applySystemTheme();
    } else {
      storeTheme(next);
      applyTheme(next);
    }
  }

  return (
    <section className="card">
      <h2>Appearance</h2>
      <p className="muted small">Choose light or dark, or follow your system setting.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            onClick={() => choose(option.value)}
            className={choice === option.value ? "btn-primary btn-small" : "btn-secondary btn-small"}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
