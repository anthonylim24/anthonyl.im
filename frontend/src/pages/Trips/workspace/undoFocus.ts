import type { TripDay } from "../types"

interface Step {
  /** The days the undo brings back. */
  before: { days: readonly TripDay[] }
  /** The days the undo takes away. */
  after: { days: readonly TripDay[] }
}

/**
 * Where focus can go once a step is undone, best first: the stops it brings
 * back, then the stops it moves back to another day, then the stop beside
 * each one it takes away (before it first, so an undone copy hands focus to
 * its original).
 */
export function undoFocus({ before, after }: Step): string[] {
  const dayNow = dayOfStop(before.days)
  const dayWas = dayOfStop(after.days)
  const back = [...dayNow.keys()].filter((id) => !dayWas.has(id))
  const moved = [...dayNow.keys()].filter((id) => dayWas.has(id) && dayWas.get(id) !== dayNow.get(id))
  const beside = after.days.flatMap((day) =>
    day.items.flatMap((item, i) => (dayNow.has(item.id) ? [] : [day.items[i - 1]?.id, day.items[i + 1]?.id])).filter((id): id is string => !!id && dayNow.has(id)),
  )
  return [...new Set([...back, ...moved, ...beside])]
}

function dayOfStop(days: readonly TripDay[]): Map<string, string> {
  return new Map(days.flatMap((day) => day.items.map((item) => [item.id, day.id] as const)))
}
