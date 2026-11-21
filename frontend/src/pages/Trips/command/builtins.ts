import { Keyboard, LayoutGrid, Monitor, Moon, Plus, Sun } from "lucide-react"
import type { Theme } from "../../Korea/koreaUtils"
import type { Command } from "./commands"

// Commands the palette offers on every Trips page, after the page's own.

export interface BuiltInDeps {
  navigate: (to: string) => void
  showShortcuts: () => void
  /** The stored theme choice when the palette opened. */
  theme: Theme
  setTheme: (theme: Theme) => void
  /** On the trips list, where `n` starts a new trip. */
  atIndex: boolean
}

const THEMES: ReadonlyArray<{ theme: Theme; title: string; icon: Command["icon"]; keywords: string[] }> = [
  { theme: "light", title: "Use light theme", icon: Sun, keywords: ["theme", "appearance", "day", "bright"] },
  { theme: "dark", title: "Use dark theme", icon: Moon, keywords: ["theme", "appearance", "night", "dim"] },
  { theme: "system", title: "Match the system theme", icon: Monitor, keywords: ["theme", "appearance", "auto", "device", "os"] },
]

export function builtInCommands({ navigate, showShortcuts, theme, setTheme, atIndex }: BuiltInDeps): Command[] {
  return [
    {
      id: "trips:new",
      title: "New trip",
      group: "Actions",
      icon: Plus,
      keywords: ["create", "plan", "start"],
      shortcut: atIndex ? ["n"] : undefined,
      run: () => navigate("/trips/new"),
    },
    {
      id: "trips:all",
      title: "All trips",
      group: "Go to",
      icon: LayoutGrid,
      keywords: ["home", "list", "index"],
      run: () => navigate("/trips"),
    },
    {
      id: "trips:shortcuts",
      title: "Keyboard shortcuts",
      group: "Settings",
      icon: Keyboard,
      keywords: ["keys", "hotkeys", "help"],
      shortcut: ["?"],
      run: showShortcuts,
    },
    ...THEMES.map(
      (option): Command => ({
        id: `trips:theme-${option.theme}`,
        title: option.title,
        subtitle: option.theme === theme ? "In use" : undefined,
        group: "Settings",
        icon: option.icon,
        keywords: option.keywords,
        run: () => setTheme(option.theme),
      }),
    ),
  ]
}
