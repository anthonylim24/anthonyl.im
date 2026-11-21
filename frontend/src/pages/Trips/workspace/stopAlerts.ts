import { soaking, wetDuring, wetSpells, wetWord, type HourForecast, type WetSpell } from "../forecast"
import { clockRange, layoutDay } from "../timeline/timeline"
import type { TripDay } from "../types"

export interface RainAlert {
  /** "Showers likely · 60% chance". */
  text: string
  /** 70% or more, or a storm. */
  heavy: boolean
  /** The wet spell the stop meets: when, how likely, what falls. */
  spell: WetSpell
}

/** What a stop card in the list warns about. */
export interface StopAlert {
  /** "Overlaps Kiyomizu-dera", "Tight · ≈ 15 min by transit, no gap"; on the later of the two stops. */
  conflict: string | null
  /** When the stop's time meets a likely wet spell. */
  rain: RainAlert | null
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
    const spell = wetDuring(spells, block.start, block.end)
    const rain = spell
      ? { text: `${wetWord(spell.code)} likely · ${spell.chance}% chance`, heavy: soaking(spell), spell }
      : null
    if (conflict || rain) alerts.set(block.itemId, { conflict, rain })
  }
  return alerts
}

/** The button that hands a wet spell to Ideas: "Rework around the showers". */
export const reworkLabel = (spell: WetSpell) => `Rework around the ${wetWord(spell.code).toLowerCase()}`

/** What "Rework around the rain" asks Ideas for: the wet window, and indoor places to fill it. */
export function rainBrief(spell: WetSpell): string {
  return `${wetWord(spell.code)} likely ${clockRange(spell.from, spell.to)} (${spell.chance}% chance). Rework the day around it: keep outdoor stops out of that window and suggest indoor places nearby to fill it.`
}
