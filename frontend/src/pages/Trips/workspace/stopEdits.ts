import { formatClock } from "../meta"
import { copyItemToDays, duplicateItem, moveItem, moveItemToDay, setItemTime, updateItem } from "../tripEdits"
import type { ItineraryItem, TripDay, TripLocation } from "../types"
import type { DayOption } from "../useTripEditor"
import type { UndoMark } from "../editorMachine"

/** Where the editor is drawn: under the card, or in a sheet over the day. */
export type EditorSurface = "inline" | "sheet"

/**
 * From this width a list card opens its editor under itself. Narrower, a
 * kit Modal is a bottom sheet, and the editor is one: in thumb reach, with
 * Done always on screen, instead of a long card the page scrolls past.
 */
export const INLINE_EDITOR_QUERY = "(min-width: 640px)"

type Edit = (fn: (days: TripDay[]) => TripDay[], undo?: UndoMark) => void

export interface StopContext {
  item: ItineraryItem
  dayId: string
  /** Its place in the day's items, and how many there are. */
  index: number
  count: number
  dayOptions: DayOption[]
  /** Parked under "To schedule": giving it a time puts it on the route. */
  parked: boolean
  onChange: Edit
  onAnnounce?: (message: string) => void
  /** The stop left this day (moved to another): the list moves focus on. */
  onGone?: (index: number) => void
  /** A copy went in after the stop: the editor closes, and the copy takes focus once the list has it. */
  onDuplicated?: (index: number, spoken: string) => void
}

/** What can be done to one stop, with the undo labels and announcements each change carries. */
export function stopEdits({ item, dayId, index, count, dayOptions, parked, onChange, onAnnounce, onGone, onDuplicated }: StopContext) {
  const name = `“${item.title || "Untitled"}”`
  const spokenName = item.title || "Stop"
  const dayName = (id: string) => dayOptions.find((option) => option.id === id)?.label.split(" · ")[0] ?? "another day"
  return {
    name,
    patch: (patch: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, patch)),
    /** Up or down one place; false at either end. */
    move: (step: -1 | 1) => {
      if (index + step < 0 || index + step >= count) return false
      onChange((days) => moveItem(days, dayId, item.id, step), { label: `Moved ${name}`, key: `move:${item.id}` })
      onAnnounce?.(`${spokenName} moved ${step < 0 ? "up" : "down"}, now ${index + step + 1} of ${count}.`)
      return true
    },
    moveTo: (to: string) => {
      onChange((days) => moveItemToDay(days, dayId, item.id, to), { label: `Moved ${name} to ${dayName(to)}`, toast: true })
      onGone?.(index)
    },
    copyTo: (to: string[]) => {
      const where = to.length === 1 ? dayName(to[0]!) : `${to.length} days`
      onChange((days) => copyItemToDays(days, dayId, item.id, to), { label: `Copied ${name} to ${where}`, toast: true })
      onAnnounce?.(`${spokenName} copied to ${where}.`)
    },
    setTime: (time: string | undefined) => {
      onChange((days) => setItemTime(days, dayId, item.id, time))
      if (parked && time) onAnnounce?.(`${spokenName} is on the route at ${formatClock(time)}.`)
    },
    /** Off the map, keeping the place's name. Returns what it was, for `pinAgain`. */
    removePin: () => {
      const was = item.location
      if (!was) return null
      onChange((days) => updateItem(days, dayId, item.id, { location: { name: was.name || item.title, source: was.source } }), { label: `Removed the pin from ${name}` })
      onAnnounce?.(`Pin removed from ${spokenName}.`)
      return was
    },
    pinAgain: (location: TripLocation) => {
      onChange((days) => updateItem(days, dayId, item.id, { location }), { label: `Pinned ${name} again` })
      onAnnounce?.(`${spokenName} is back on the map.`)
    },
    duplicate: () => {
      onChange((days) => duplicateItem(days, dayId, item.id), { label: `Duplicated ${name}`, toast: true })
      onDuplicated?.(index, `${spokenName} duplicated. The copy is next in the day.`)
    },
  }
}

export type StopEdits = ReturnType<typeof stopEdits>
