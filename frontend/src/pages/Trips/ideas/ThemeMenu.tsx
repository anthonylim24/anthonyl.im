import { createElement } from "react"
import { Check, ChevronDown } from "lucide-react"
import { sx } from "@/styles/merge"
import type { UndoMark } from "../editorMachine"
import { Menu, type MenuItem } from "../components/kit"
import { setIdeaTheme } from "../tripEdits"
import { ITEM_THEMES, type ItemTheme, type ItineraryItem, type Trip } from "../types"
import { ws as s } from "../workspace.stylex"
import { ideaName } from "./contract"
import { THEME_ORDER, THEMES, inferredTheme, themeLabel, themeOf } from "./themes"

// An idea's wishlist category: what the list filters and groups by. Shown
// to everyone; editors can file the idea under another one, or go back to
// "Automatic", which reads it from the place again. One write per pick,
// through the trip's `onEdit`, so Undo takes it back.

type Edit = (fn: (doc: Trip) => Trip, undo?: UndoMark) => void

interface ThemeControlProps {
  idea: ItineraryItem
  /** An AI run owns the trip: the category shows as text. */
  locked: boolean
  onEdit: Edit
}

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const


/** File `idea` under `next` (null: automatic). Picking what it already is writes nothing. */
function fileUnder(idea: ItineraryItem, next: ItemTheme | null, onEdit: Edit) {
  if (next === (idea.theme ?? null)) return
  const name = ideaName(idea)
  const label = next ? `Filed “${name}” under ${themeLabel(next)}` : `Filed “${name}” automatically`
  onEdit((doc) => setIdeaTheme(doc, idea.id, next), { label })
}

/** "Category for Tram 28: Sights & culture", with "(automatic)" when inferred: the control's name says its value. */
function controlName(idea: ItineraryItem): string {
  return `Category for ${ideaName(idea)}: ${themeLabel(themeOf(idea))}${idea.theme ? "" : " (automatic)"}`
}

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

/**
 * The category as a small menu button: for the wishlist rows. Not for use
 * inside a dialog or popover: the kit menu portals to <body>, outside a
 * dialog's focus trap, and closes the moment it opens there (`ThemeSelect`).
 */
export function ThemeMenu({ idea, locked, onEdit }: ThemeControlProps) {
  // The kit menu has no disabled state: while an AI run owns the trip, show the category, not a dead control.
  if (locked) return <ThemeTag idea={idea} />
  const theme = themeOf(idea)
  const auto = inferredTheme(idea)
  const stored = idea.theme ?? null

  // The menu's items have no checked state, so the current choice wears a
  // check in place of its glyph, and the button's name says what it is.
  const items: MenuItem[] = [
    {
      label: `Automatic (${themeLabel(auto)})`,
      icon: createElement(stored === null ? Check : THEMES[auto].icon, ICON),
      onSelect: () => fileUnder(idea, null, onEdit),
    },
    ...THEME_ORDER.map((option, i) => ({
      label: themeLabel(option),
      icon: createElement(stored === option ? Check : THEMES[option].icon, ICON),
      onSelect: () => fileUnder(idea, option, onEdit),
      separated: i === 0,
    })),
  ]

  return (
    <Menu
      label={controlName(idea)}
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

const AUTOMATIC = "auto"

/**
 * The category as a native select: for inside the details popover or
 * sheet, where a portalled menu cannot live (a phone gets its own picker).
 */
export function ThemeSelect({ idea, locked, onEdit }: ThemeControlProps) {
  if (locked) return <ThemeTag idea={idea} />
  const theme = themeOf(idea)
  return (
    <span {...sx(s.ideaThemeField)}>
      <span {...sx(s.ideaThemeFieldIcon)}>{createElement(THEMES[theme].icon, ICON)}</span>
      <select
        aria-label={controlName(idea)}
        value={idea.theme ?? AUTOMATIC}
        {...sx(s.ideaThemeSelect)}
        onChange={(event) => {
          const value = event.target.value
          fileUnder(idea, (ITEM_THEMES as readonly string[]).includes(value) ? (value as ItemTheme) : null, onEdit)
        }}
      >
        <option value={AUTOMATIC}>Automatic ({themeLabel(inferredTheme(idea))})</option>
        {THEME_ORDER.map((option) => (
          <option key={option} value={option}>
            {themeLabel(option)}
          </option>
        ))}
      </select>
    </span>
  )
}
