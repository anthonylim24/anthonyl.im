import { formatClock, plural, STATUS_LABEL } from "../meta"
import { stopTitle } from "../timeline/timeline"
import type { ChangeCounts, Clock, DayOrder, EditedField, StopChange } from "./planDiff"

// The words the changes sheet says about each change. Plain sentences and
// mono details; the glyph beside each row is never the only signal.

/** The kind of change, said first to a screen reader (the glyph is hidden). */
export const KIND_WORD: Record<StopChange["kind"], string> = {
  added: "Added",
  removed: "Removed",
  movedIn: "Moved here",
  movedOut: "Moved away",
  retimed: "New time",
  edited: "Changed",
}

const at = (time?: string) => (time ? formatClock(time) : "Anytime")

function clockWords(before: Clock, after: Clock): string {
  if ((before.time ?? "") !== (after.time ?? "")) return `${at(before.time)} → ${at(after.time)}`
  if (!after.endTime) return "End time cleared"
  return before.endTime ? `Ends ${formatClock(before.endTime)} → ${formatClock(after.endTime)}` : `Now ends ${formatClock(after.endTime)}`
}

function fieldWords(fields: readonly EditedField[], status: StopChange["item"]["status"]): string[] {
  return fields.map((field) =>
    field === "title"
      ? "Renamed"
      : field === "notes"
        ? "Notes updated"
        : field === "location"
          ? "Place updated"
          : status === "none"
            ? "Status cleared"
            : `Marked ${STATUS_LABEL[status].toLowerCase()}`,
  )
}

/** The mono line under a stop's name: "8:30 AM → 10:20 AM", "From your wishlist · 8:30 AM", "To Day 4". */
export function changeDetail(change: StopChange, dayName: (dayId: string) => string): string {
  const time = change.item.time ? formatClock(change.item.time) : null
  const withTime = (lead: string) => (time ? `${lead} · ${time}` : lead)
  switch (change.kind) {
    case "added":
      return withTime(change.fromWishlist ? "From your wishlist" : "Added")
    case "removed":
      return "Removed"
    case "movedIn":
      return withTime(`From ${dayName(change.fromDayId)}`)
    case "movedOut":
      return `To ${dayName(change.toDayId)}`
    case "retimed":
      return [clockWords(change.before, change.item), ...fieldWords(change.fields, change.item.status)].join(" · ")
    case "edited":
      return fieldWords(change.fields, change.item.status).join(" · ")
  }
}

/** A day's new order as a row: a name and a mono detail. */
export function orderWords(order: DayOrder): { name: string; detail: string } {
  if (order.kind === "untimed") return { name: "New order", detail: "Stops without a time are in a new order" }
  const stop = (item: typeof order.earlier) => `${stopTitle(item)} ${at(item.time)}`
  return { name: "Back in time order", detail: `${stop(order.earlier)} now comes before ${stop(order.later)}` }
}

/** "2 added · 3 retimed · 1 moved · 1 removed", zero parts left out. */
export function summaryParts(counts: ChangeCounts): string[] {
  return [
    counts.added && `${counts.added} added`,
    counts.retimed && `${counts.retimed} retimed`,
    counts.moved && `${counts.moved} moved`,
    counts.removed && `${counts.removed} removed`,
    counts.edited && `${counts.edited} edited`,
    counts.swaps && plural(counts.swaps, "swap"),
    counts.inClockOrder && `${plural(counts.inClockOrder, "day")} back in time order`,
    counts.reordered && `${plural(counts.reordered, "day")} reordered`,
  ].filter((part): part is string => Boolean(part))
}

/** The one sentence a screen reader hears when the sheet opens. */
export function spokenSummary(counts: ChangeCounts, days: number, skipped: number): string {
  const parts = summaryParts(counts)
  const changed = parts.length > 0 ? `The review changed ${plural(days, "day")}: ${parts.join(", ")}.` : "Nothing on the plan changed."
  if (skipped === 0) return changed
  return `${changed} ${skipped === 1 ? "1 suggestion" : `${skipped} suggestions`} couldn’t be applied.`
}
