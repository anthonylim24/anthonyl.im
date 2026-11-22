import { formatClock } from "../meta"
import type { EnhancementSuggestion, Trip } from "../types"

/** Shown before "…": a reorder's new clock reads in one line, never a paragraph. */
const TIMES_SHOWN = 4

/**
 * "Gyeongbokgung 9:00 AM · Bukchon 11:30 AM …": the clock a reorder gives
 * the stops it re-times, in the order it proposes (so a 1 AM stop after a
 * late dinner stays last), else by time.
 */
export function proposedTimesLine(suggestion: EnhancementSuggestion, trip: Trip): string | null {
  const times = Object.entries(suggestion.proposedTimes ?? {}).filter(([, clock]) => clock.time)
  if (suggestion.kind !== "reorder" || times.length === 0) return null
  const items = new Map(trip.days.flatMap((day) => day.items.map((item) => [item.id, item] as const)))
  const order = suggestion.proposedOrder ?? []
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  const named = times
    .map(([id, clock]) => ({ rank: rank(id), name: items.get(id)?.title.trim() || "A stop", time: clock.time! }))
    .sort((x, y) => x.rank - y.rank || x.time.localeCompare(y.time))
  const shown = named.slice(0, TIMES_SHOWN).map(({ name, time }) => `${name} ${formatClock(time)}`)
  return `${shown.join(" · ")}${named.length > TIMES_SHOWN ? " …" : ""}`
}
