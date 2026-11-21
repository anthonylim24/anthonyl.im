import { soaking, wetDuring, wetSpells, wetWord, type HourForecast, type WetSpell } from "../forecast"
import { clockLabel, clockRange, layoutDay, type TimelineConflict } from "../timeline/timeline"
import type { TripDay } from "../types"

export interface RainAlert {
  /** "Showers until 5 PM · 60%": what the spell means for this stop (see `rainLine`). */
  text: string
  /** 70% or more, or a storm. */
  heavy: boolean
  /** The wet spell the stop meets: when, how likely, what falls. */
  spell: WetSpell
}

/** A clash with an earlier stop, carried by the later one. Named by the other stop's map number ("Overlaps ②"). */
export interface ConflictAlert {
  kind: TimelineConflict["kind"]
  /** The earlier stop. */
  otherId: string
  /** For a tight leg: "~15 min by transit, no gap". */
  detail: string | null
  /** Further clashes on the same stop. */
  more: number
}

/** What a stop card in the list warns about. */
export interface StopAlert {
  conflict: ConflictAlert | null
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
  const conflicts = new Map<string, TimelineConflict[]>()
  for (const conflict of layout.conflicts) conflicts.set(conflict.ids[1], [...(conflicts.get(conflict.ids[1]) ?? []), conflict])
  const spells = wetSpells(hours ?? [])
  const alerts = new Map<string, StopAlert>()
  for (const block of layout.blocks) {
    const [first, ...rest] = conflicts.get(block.itemId) ?? []
    const conflict = first ? { kind: first.kind, otherId: first.ids[0], detail: tightDetail(first), more: rest.length } : null
    const spell = wetDuring(spells, block.start, block.end)
    const rain = spell ? { text: rainLine(spell, block.start, block.end), heavy: soaking(spell), spell } : null
    if (conflict || rain) alerts.set(block.itemId, { conflict, rain })
  }
  return alerts
}

/** "~15 min by transit, no gap", from the layout's "Tight · …" detail. */
const tightDetail = (conflict: TimelineConflict) => (conflict.kind === "tight" ? conflict.detail.replace(/^Tight · /, "") : null)

/**
 * What a wet spell means for one stop, the same words in the list and on the
 * timeline: "Showers likely · 60%" when the stop sits inside it, else the part
 * that is wet ("Showers until 5 PM", "Showers from 2 PM", "Showers 2–5 PM").
 */
export function rainLine(spell: WetSpell, start: number, end: number): string {
  const word = wetWord(spell.code)
  const before = start < spell.from
  const after = end > spell.to
  const when = before && after ? clockRange(spell.from, spell.to, "prose") : before ? `from ${clockLabel(spell.from)}` : after ? `until ${clockLabel(spell.to)}` : "likely"
  return `${word} ${when} · ${spell.chance}%`
}

/** The button that hands a wet spell to Ideas: "Rework around the showers". */
export const reworkLabel = (spell: WetSpell) => `Rework around the ${wetWord(spell.code).toLowerCase()}`

/** What "Rework around the rain" asks Ideas for: the wet window, and indoor places to fill it. */
export function rainBrief(spell: WetSpell): string {
  return `${wetWord(spell.code)} likely ${clockRange(spell.from, spell.to, "prose")} (${spell.chance}% chance). Rework the day around it: keep outdoor stops out of that window and suggest indoor places nearby to fill it.`
}
