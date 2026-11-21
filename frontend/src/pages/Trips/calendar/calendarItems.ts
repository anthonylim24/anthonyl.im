import { clockMinutes } from "../dayClock"
import type { ItineraryItem } from "../types"

// What goes in a calendar export, kept apart from `ics.ts` so the menus that
// offer "Export to calendar" can tell whether there is anything to export
// without loading the exporter itself (a lazy chunk).

/** Stops that belong in a calendar: not headings, and notes only when timed. */
export function isCalendarItem(item: ItineraryItem): boolean {
  if (item.kind === "section") return false
  if (item.kind === "note") return clockMinutes(item.time) !== null
  return true
}
