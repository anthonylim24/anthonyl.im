import { wetDuring, wetSpells, wetWord, type HourForecast } from "../forecast"
import { layoutDay } from "../timeline/timeline"
import type { TripDay } from "../types"

/** What a stop card in the list warns about. */
export interface StopAlert {
  /** "Overlaps Kiyomizu-dera", "Tight · ≈ 15 min by transit, no gap"; on the later of the two stops. */
  conflict: string | null
  /** "Showers likely · 60% chance", when the stop's time meets a likely wet spell. */
  rain: string | null
}

/**
 * The list view's warnings, read from the same layout and the same hours the
 * timeline draws, so the two views never disagree. Stops with nothing to say
 * are left out.
 */
export function stopAlerts(day: TripDay, hours: readonly HourForecast[] | undefined): Map<string, StopAlert> {
  const layout = layoutDay(day)
  const conflicts = new Map<string, string[]>()
  for (const { ids, detail } of layout.conflicts) conflicts.set(ids[1], [...(conflicts.get(ids[1]) ?? []), detail])
  const spells = wetSpells(hours ?? [])
  const alerts = new Map<string, StopAlert>()
  for (const block of layout.blocks) {
    const details = conflicts.get(block.itemId) ?? []
    const conflict = details.length > 0 ? `${details[0]}${details.length > 1 ? ` · +${details.length - 1}` : ""}` : null
    const wet = wetDuring(spells, block.start, block.end)
    const rain = wet ? `${wetWord(wet.code)} likely · ${wet.chance}% chance` : null
    if (conflict || rain) alerts.set(block.itemId, { conflict, rain })
  }
  return alerts
}
