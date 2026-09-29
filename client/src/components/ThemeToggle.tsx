import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { applyTheme, getStoredTheme, getSystemTheme, storeTheme, type Theme } from "../lib/theme";

/**
 * Icon reflects the CURRENT theme (sun while light, moon while dark) and
 * the click switches to the other one — matches index.html's inline
 * boot script and index.css's `[data-theme]` override rules. Starts from
 * the stored choice if the user has picked one before, else whatever the
 * OS currently resolves to (so the icon matches what's on screen without
 * this component itself forcing an explicit theme until clicked).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    // Only reacts to the stored choice — an explicit pick always wins,
    // so this doesn't need to re-sync with the OS after mount.
    if (getStoredTheme()) applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink ${className}`}
    >
      {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
