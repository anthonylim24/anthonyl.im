import { createElement } from "react"
import { Check, ChevronDown } from "lucide-react"
import { sx } from "@/styles/merge"
import type { UndoMark } from "../editorMachine"
import { Menu, type MenuItem } from "../components/kit"
import { setIdeaTheme } from "../tripEdits"
import type { ItemTheme, ItineraryItem, Trip } from "../types"
import { ws as s } from "../workspace.stylex"
import { THEME_ORDER, THEMES, inferredTheme, themeLabel, themeOf } from "./themes"

// An idea's wishlist category: what the list filters and groups by. Shown
// to everyone; editors can file the idea under another one, or go back to
// "Automatic", which reads it from the place again. One write per pick,
// through the trip's `onEdit`, so Undo takes it back.

type Edit = (fn: (doc: Trip) => Trip, undo?: UndoMark) => void

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const

const ideaName = (idea: ItineraryItem) => idea.title || idea.location?.name || "Untitled place"

/** The category as plain text with its glyph: what viewers see, and editors while the trip is locked. */
export function ThemeTag({ idea }: { idea: ItineraryItem }) {
  const theme = themeOf(idea)
  return (
    <span {...sx(s.ideaThemeTag)}>
      {createElement(THEMES[theme].icon, ICON)}
      <span {...sx(s.ideaThemeText)}>{themeLabel(theme)}</span>
    </span>
  )
}

export function ThemeMenu({ idea, locked, onEdit }: { idea: ItineraryItem; locked: boolean; onEdit: Edit }) {
  // The kit menu has no disabled state: while an AI run owns the trip, show the category, not a dead control.
  if (locked) return <ThemeTag idea={idea} />

  const name = ideaName(idea)
  const theme = themeOf(idea)
  const auto = inferredTheme(idea)
  const stored = idea.theme ?? null

  const pick = (next: ItemTheme | null) => {
    if (next === stored) return
    const label = next ? `Filed “${name}” under ${themeLabel(next)}` : `Filed “${name}” automatically`
    onEdit((doc) => setIdeaTheme(doc, idea.id, next), { label })
  }

  // The menu's items have no checked state, so the current choice wears a
  // check in place of its glyph, and the button's name says what it is.
  const items: MenuItem[] = [
    {
      label: `Automatic (${themeLabel(auto)})`,
      icon: createElement(stored === null ? Check : THEMES[auto].icon, ICON),
      onSelect: () => pick(null),
    },
    ...THEME_ORDER.map((option, i) => ({
      label: themeLabel(option),
      icon: createElement(stored === option ? Check : THEMES[option].icon, ICON),
      onSelect: () => pick(option),
      separated: i === 0,
    })),
  ]

  return (
    <Menu
      label={`Category for ${name}: ${themeLabel(theme)}${stored === null ? " (automatic)" : ""}`}
      align="start"
      triggerStyle={s.ideaThemeBtn}
      items={items}
      trigger={
        <>
          {createElement(THEMES[theme].icon, ICON)}
          <span {...sx(s.ideaThemeText)}>{themeLabel(theme)}</span>
          <ChevronDown size={12} strokeWidth={2} aria-hidden />
        </>
      }
    />
  )
}
