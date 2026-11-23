import { dayStarts } from "../dayClock"
import { sameJson } from "../tripMerge"
import type { ItineraryItem, Trip, TripDay } from "../types"

// What changed in the plan between two copies of a trip, stop by stop and
// day by day. Read from the documents, never from the suggestions that
// caused it: the server also sorts the days it touches by clock and re-times
// reorders, so the before and after trips are the only truth.
//
// Stops are matched by id across the whole trip. Headings are not stops.
// Each stop gives at most one change per day it is on, by precedence:
// a move (in on the new day, out on the old) over a new clock over an edit.

export type EditedField = "title" | "notes" | "location" | "status"

export interface Clock {
  time?: string
  endTime?: string
}

export type StopChange =
  | { kind: "added"; item: ItineraryItem; fromWishlist: boolean }
  | { kind: "removed"; item: ItineraryItem }
  | { kind: "movedIn"; item: ItineraryItem; fromDayId: string }
  /** `item` as it stood on the day it left. */
  | { kind: "movedOut"; item: ItineraryItem; toDayId: string }
  /** `fields`: what else changed on the stop besides its clock (often nothing). */
  | { kind: "retimed"; item: ItineraryItem; before: Clock; fields: EditedField[] }
  | { kind: "edited"; item: ItineraryItem; fields: EditedField[] }

export type ChangeKind = StopChange["kind"]

/** How the stops that stayed on a day changed order, when that is news beyond their own changes. */
export type DayOrder =
  /** The day was listed out of clock order and now reads in it: `earlier` was below `later`, now above. */
  | { kind: "clock"; earlier: ItineraryItem; later: ItineraryItem }
  /** The stops with no time run in another order (timed order follows the clock). */
  | { kind: "untimed" }

export interface DayDiff {
  dayId: string
  /** In the day's clock order: a stop that left sits where it stood, untimed stops last. */
  changes: StopChange[]
  reordered: DayOrder | null
  /** The day's whole plan traded places with this day's: its stops are not listed as moves. */
  swappedWith: string | null
}

export interface PlanDiff {
  /** Only days with something to say, in the trip's day order. */
  days: DayDiff[]
}

/** A suggestion an apply could not carry out, and why, in one sentence. */
export interface SkippedSuggestion {
  id: string
  title: string
  reason: string
}

/** What one apply did: the trip either side of it, and what it couldn't do. */
export interface AppliedChanges {
  before: Trip
  after: Trip
  skipped: SkippedSuggestion[]
}

const isStop = (item: ItineraryItem) => item.kind !== "section"

interface Placed {
  dayId: string
  item: ItineraryItem
  /** Start on the day's clock (`dayStarts`), null when untimed. */
  start: number | null
  /** Position in the day's list, for untimed stops and ties. */
  index: number
}

function placeStops(trip: Trip): Map<string, Placed> {
  const placed = new Map<string, Placed>()
  for (const day of trip.days) {
    const starts = dayStarts(day.items.map((item) => (isStop(item) ? item : {})))
    day.items.forEach((item, index) => {
      if (isStop(item)) placed.set(item.id, { dayId: day.id, item, start: starts[index] ?? null, index })
    })
  }
  return placed
}

const clockOf = (item: ItineraryItem): Clock => ({ time: item.time, endTime: item.endTime })
const sameClock = (a: ItineraryItem, b: ItineraryItem) => (a.time ?? "") === (b.time ?? "") && (a.endTime ?? "") === (b.endTime ?? "")

function editedFields(was: ItineraryItem, now: ItineraryItem): EditedField[] {
  const fields: EditedField[] = []
  if ((was.title ?? "") !== (now.title ?? "")) fields.push("title")
  if ((was.notes ?? "") !== (now.notes ?? "")) fields.push("notes")
  if (!sameJson(was.location ?? null, now.location ?? null)) fields.push("location")
  if (was.status !== now.status) fields.push("status")
  return fields
}

/** A change and where it sorts on its day. */
interface Entry {
  change: StopChange
  at: Placed
}

/** Clock order, untimed last; ties and untimed stops by list position. */
const byClock = (x: Entry, y: Entry) =>
  (x.at.start ?? Infinity) - (y.at.start ?? Infinity) || x.at.index - y.at.index

/**
 * Two days whose stops all went to each other ("swap_days"): every stop
 * moved, but the traveller reads one swap, not a dozen moves. A stop that
 * joined either day from a third one is still its own move.
 */
function findSwaps(before: Trip, now: Map<string, Placed>): Map<string, string> {
  /** The one other day all of a day's stops went to. */
  const wentWhole = new Map<string, string>()
  for (const day of before.days) {
    const targets = new Set(day.items.filter(isStop).map((item) => now.get(item.id)?.dayId ?? null))
    const [target] = targets
    if (targets.size === 1 && target && target !== day.id) wentWhole.set(day.id, target)
  }
  const swaps = new Map<string, string>()
  for (const [dayId, target] of wentWhole) {
    if (wentWhole.get(target) === dayId) swaps.set(dayId, target)
  }
  return swaps
}

export function diffPlan(before: Trip, after: Trip): PlanDiff {
  const was = placeStops(before)
  const now = placeStops(after)
  const wished = new Set((before.ideas ?? []).map((idea) => idea.id))
  const swaps = findSwaps(before, now)
  const entries = new Map<string, Entry[]>()
  const push = (dayId: string, change: StopChange, at: Placed) => {
    const list = entries.get(dayId)
    if (list) list.push({ change, at })
    else entries.set(dayId, [{ change, at }])
  }

  for (const [id, at] of now) {
    const old = was.get(id)
    const item = at.item
    if (!old) {
      push(at.dayId, { kind: "added", item, fromWishlist: item.fromWishlist === true || wished.has(id) }, at)
      continue
    }
    if (old.dayId !== at.dayId) {
      if (swaps.get(old.dayId) === at.dayId) continue
      push(at.dayId, { kind: "movedIn", item, fromDayId: old.dayId }, at)
      push(old.dayId, { kind: "movedOut", item: old.item, toDayId: at.dayId }, old)
      continue
    }
    const fields = editedFields(old.item, item)
    if (!sameClock(old.item, item)) push(at.dayId, { kind: "retimed", item, before: clockOf(old.item), fields }, at)
    else if (fields.length > 0) push(at.dayId, { kind: "edited", item, fields }, at)
  }
  for (const [id, old] of was) {
    if (!now.has(id)) push(old.dayId, { kind: "removed", item: old.item }, old)
  }

  const beforeDays = new Map(before.days.map((day) => [day.id, day]))
  const order = [...after.days, ...before.days.filter((day) => !after.days.some((d) => d.id === day.id))]
  const days: DayDiff[] = []
  for (const day of order) {
    const changes = (entries.get(day.id) ?? []).sort(byClock).map((entry) => entry.change)
    const old = beforeDays.get(day.id)
    const reordered = old === undefined ? null : orderChange(old, day, was, now)
    const swappedWith = swaps.get(day.id) ?? null
    if (changes.length > 0 || reordered || swappedWith) days.push({ dayId: day.id, changes, reordered, swappedWith })
  }
  return { days }
}

/**
 * The stops that stayed on the day, compared in list order. A day that was
 * listed out of clock order and was put back in it names the first pair it
 * fixed; otherwise only the untimed stops' order is news (retimed rows
 * already explain timed moves).
 */
function orderChange(was: TripDay, now: TripDay, wasAt: Map<string, Placed>, nowAt: Map<string, Placed>): DayOrder | null {
  const stayed = (id: string) => wasAt.get(id)?.dayId === was.id && nowAt.get(id)?.dayId === now.id
  const before = was.items.filter((item) => isStop(item) && stayed(item.id))
  const after = now.items.filter((item) => isStop(item) && stayed(item.id))
  if (before.every((item, i) => after[i]?.id === item.id)) return null

  const starts = dayStarts(before)
  const position = new Map(after.map((item, i) => [item.id, i]))
  let previous = -1
  for (let i = 0; i < before.length; i++) {
    const start = starts[i]
    if (start == null) continue
    if (previous >= 0 && start < starts[previous]!) {
      const later = before[previous]!
      const earlier = before[i]!
      if (position.get(earlier.id)! < position.get(later.id)!) {
        return { kind: "clock", earlier: after[position.get(earlier.id)!]!, later: after[position.get(later.id)!]! }
      }
      break
    }
    previous = i
  }

  const untimed = (items: readonly ItineraryItem[]) => items.filter((item) => wasAt.get(item.id)?.start === null && nowAt.get(item.id)?.start === null).map((item) => item.id)
  const untimedBefore = untimed(before)
  const untimedAfter = untimed(after)
  return untimedBefore.some((id, i) => untimedAfter[i] !== id) ? { kind: "untimed" } : null
}

export interface ChangeCounts {
  added: number
  retimed: number
  /** Each moved stop once (not once per day it touched). */
  moved: number
  removed: number
  edited: number
  /** Pairs of days that traded plans. */
  swaps: number
  /** Days listed out of clock order that now read in it. */
  inClockOrder: number
  /** Days whose untimed stops changed order. */
  reordered: number
}

export function countChanges(diff: PlanDiff): ChangeCounts {
  const counts: ChangeCounts = { added: 0, retimed: 0, moved: 0, removed: 0, edited: 0, swaps: 0, inClockOrder: 0, reordered: 0 }
  for (const day of diff.days) {
    if (day.reordered?.kind === "clock") counts.inClockOrder += 1
    else if (day.reordered) counts.reordered += 1
    // Both days of a swap are listed; count the pair from one side.
    if (day.swappedWith && day.dayId < day.swappedWith) counts.swaps += 1
    for (const change of day.changes) {
      if (change.kind === "added") counts.added += 1
      else if (change.kind === "retimed") counts.retimed += 1
      else if (change.kind === "movedIn") counts.moved += 1
      else if (change.kind === "removed") counts.removed += 1
      else if (change.kind === "edited") counts.edited += 1
    }
  }
  return counts
}

/** Stops the apply put in place or changed (not the ones it took away): the list flashes them. */
export function touchedStops(diff: PlanDiff): Set<string> {
  const ids = new Set<string>()
  for (const day of diff.days) {
    for (const change of day.changes) if (change.kind !== "removed" && change.kind !== "movedOut") ids.add(change.item.id)
  }
  return ids
}
