// Keyboard shortcut vocabulary for the command palette and the shortcuts
// sheet. Shortcuts are written once, platform-neutral, as key tokens:
//
//   "mod"    ⌘ on Apple platforms, Ctrl elsewhere (the key apps use for ⌘K, ⌘Z)
//   "ctrl"   the Control key on every platform
//   "alt"    ⌥ Option on Apple platforms, Alt elsewhere
//   "shift"  ⇧ Shift
//   "enter" "esc" "tab" "backspace" "up" "down" "left" "right"
//   or a single printable character: "k", "/", "?"
//
// and drawn per platform here, so a component never decides what ⌘ is.

export type KeyCombo = readonly string[]

interface NavigatorLike {
  userAgentData?: { platform?: string }
  platform?: string
  userAgent?: string
}

/** True on macOS, iOS and iPadOS (iPadOS reports itself as a Mac). */
export function isApplePlatform(nav: NavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

const MODIFIERS = new Set(["mod", "ctrl", "alt", "shift"])
// Apple writes ⌃⌥⇧⌘; Windows and Linux write Ctrl+Alt+Shift.
const APPLE_ORDER = ["ctrl", "alt", "shift", "mod"]
const OTHER_ORDER = ["mod", "ctrl", "alt", "shift"]

const APPLE_GLYPH: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  enter: "↵",
  esc: "esc",
  tab: "⇥",
  backspace: "⌫",
}
const OTHER_GLYPH: Record<string, string> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  esc: "Esc",
  tab: "Tab",
  backspace: "Backspace",
}
const ARROW_GLYPH: Record<string, string> = { up: "↑", down: "↓", left: "←", right: "→" }

const APPLE_SPOKEN: Record<string, string> = { mod: "Command", ctrl: "Control", alt: "Option", enter: "Return" }
const OTHER_SPOKEN: Record<string, string> = { mod: "Control", ctrl: "Control", alt: "Alt", enter: "Enter" }
const SPOKEN: Record<string, string> = {
  shift: "Shift",
  esc: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  up: "Up arrow",
  down: "Down arrow",
  left: "Left arrow",
  right: "Right arrow",
  "?": "Question mark",
  "/": "Slash",
}

function ordered(combo: KeyCombo, apple: boolean): string[] {
  const order = apple ? APPLE_ORDER : OTHER_ORDER
  const mods = combo.filter((key) => MODIFIERS.has(key)).sort((x, y) => order.indexOf(x) - order.indexOf(y))
  return [...new Set(mods), ...combo.filter((key) => !MODIFIERS.has(key))]
}

/** One visible label per key: `["mod", "k"]` → `["⌘", "K"]` on a Mac, `["Ctrl", "K"]` elsewhere. */
export function formatShortcut(combo: KeyCombo, apple: boolean): string[] {
  const glyph = apple ? APPLE_GLYPH : OTHER_GLYPH
  return ordered(combo, apple).map((key) => glyph[key] ?? ARROW_GLYPH[key] ?? (key.length === 1 ? key.toUpperCase() : key))
}

/** What a screen reader should hear: `["shift", "mod", "z"]` → "Shift Command Z". */
export function spokenShortcut(combo: KeyCombo, apple: boolean): string {
  const spoken = apple ? APPLE_SPOKEN : OTHER_SPOKEN
  return ordered(combo, apple)
    .map((key) => spoken[key] ?? SPOKEN[key] ?? (key.length === 1 ? key.toUpperCase() : key))
    .join(" ")
}
