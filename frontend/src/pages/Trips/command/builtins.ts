import { Droplet, Keyboard, LayoutGrid, Map as MapIcon, Monitor, Moon, Plus, Sun } from "lucide-react"
import type { Look } from "../glass/look"
import type { Theme } from "../../Korea/koreaUtils"
import type { Command } from "./commands"

// Commands the palette offers on every Trips page, after the page's own.

export interface BuiltInDeps {
  navigate: (to: string) => void
  showShortcuts: () => void
  /** The stored theme choice when the palette opened. */
  theme: Theme
  setTheme: (theme: Theme) => void
  /** The look in use: the atlas or Liquid Glass. */
  look: Look
  setLook: (look: Look) => void
  /** On the trips list, where `n` starts a new trip. */
  atIndex: boolean
}

const THEMES: ReadonlyArray<{ theme: Theme; title: string; icon: Command["icon"]; keywords: string[] }> = [
  { theme: "light", title: "Use light theme", icon: Sun, keywords: ["theme", "appearance", "day", "bright"] },
  { theme: "dark", title: "Use dark theme", icon: Moon, keywords: ["theme", "appearance", "night", "dim"] },
  { theme: "system", title: "Match the system theme", icon: Monitor, keywords: ["theme", "appearance", "auto", "device", "os"] },
]

const LOOKS: ReadonlyArray<{ look: Look; title: string; icon: Command["icon"]; keywords: string[] }> = [
  { look: "glass", title: "Use the Liquid Glass look", icon: Droplet, keywords: ["look", "appearance", "glass", "ios", "translucent", "style"] },
  { look: "atlas", title: "Use the atlas look", icon: MapIcon, keywords: ["look", "appearance", "paper", "classic", "style"] },
]

export function builtInCommands({ navigate, showShortcuts, theme, setTheme, look, setLook, atIndex }: BuiltInDeps): Command[] {
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
    ...LOOKS.map(
      (option): Command => ({
        id: `trips:look-${option.look}`,
        title: option.title,
        subtitle: option.look === look ? "In use" : undefined,
        group: "Settings",
        icon: option.icon,
        keywords: option.keywords,
        run: () => setLook(option.look),
      }),
    ),
  ]
}
