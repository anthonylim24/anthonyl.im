import { plural } from "./meta"

// What an AI draft says when it lands. Shared by the new-trip page and the
// workspace's "Draft with AI" so the two never describe one result in two ways.

/** "Day 3 needs another go: open it and use “Ideas for this day”." Empty when every day came back full. */
export function thinDaysText(incompleteDays: readonly number[]): string {
  if (incompleteDays.length === 0) return ""
  const days = [...incompleteDays].sort((x, y) => x - y)
  return days.length === 1
    ? `Day ${days[0]} needs another go: open it and use “Ideas for this day”.`
    : `Days ${days.join(", ")} need another go: open each and use “Ideas for this day”.`
}

/** The notice for a draft that landed with `stops` stops over `days` days. */
export function draftNotice(stops: number, days: number, incompleteDays: readonly number[]): string {
  if (stops === 0) return "The AI draft came back empty. Use “Draft with AI” to try again, or add stops yourself."
  if (incompleteDays.length > 0) return `Drafted ${plural(stops, "stop")}, but not every day. ${thinDaysText(incompleteDays)}`
  return `Drafted ${plural(stops, "stop")} across ${plural(days, "day")}.`
}

/** "48 s", "1 min 12 s": elapsed time in plain words, for a wait that can run a few minutes. */
export function elapsedText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`
}
