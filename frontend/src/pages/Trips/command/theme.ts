import { applyTheme, getInitialTheme, persistTheme, THEME_EVENT, type Theme } from "../../Korea/koreaUtils"

// Theme changes made from the palette. The stored choice ("korea-theme" in
// localStorage, via koreaUtils) stays the one owner; this module only writes
// it and tells the page.

/**
 * Fired on `window` with the chosen `Theme` as `detail` after the palette
 * changes the theme, so the header's ThemeToggle can show the new choice.
 */
export const TRIPS_THEME_EVENT = THEME_EVENT

export function chooseTheme(theme: Theme): void {
  persistTheme(theme)
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent<Theme>(TRIPS_THEME_EVENT, { detail: theme }))
}

/**
 * Re-apply the stored theme whenever the system appearance flips, so
 * "Match the system theme" keeps matching after it is chosen here. Reading
 * the stored choice (not assuming "system") also makes this harmless when
 * the choice is light or dark. Returns the cleanup.
 */
export function followSystemTheme(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia("(prefers-color-scheme: dark)")
  const onChange = () => applyTheme(getInitialTheme())
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
