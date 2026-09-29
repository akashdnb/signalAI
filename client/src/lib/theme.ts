/**
 * Three effective states, one stored value: no `signalai.theme` in
 * localStorage means "follow the OS" (index.css's prefers-color-scheme
 * media query alone decides) — the ThemeToggle only ever writes an
 * explicit "light" or "dark" once the user picks one, which then pins the
 * `data-theme` attribute index.css's explicit-override rules key off.
 */
export type Theme = "light" | "dark";

const THEME_KEY = "signalai.theme";

export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable (private browsing, quota) — the toggle still
    // works for the rest of this page load via applyTheme, it just won't
    // persist across reloads.
  }
}
