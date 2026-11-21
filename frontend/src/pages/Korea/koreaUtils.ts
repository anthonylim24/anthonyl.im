// Theme persistence shared by the Trips layout and its theme toggle.

import { syncThemeColor } from "@/lib/themeColor"

const THEME_KEY = "korea-theme"
export type Theme = "light" | "dark" | "system"

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system"
  const stored = window.localStorage.getItem(THEME_KEY) as Theme | null
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const effective =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme
  root.classList.toggle("dark", effective === "dark")
  root.dataset.koreaTheme = effective
  syncThemeColor(effective)
}

/** Fired on `window` with the chosen `Theme` when something other than the
 *  ThemeToggle (the Trips command palette) changes the theme. */
export const THEME_EVENT = "trips:theme"

export function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(THEME_KEY, theme)
}
