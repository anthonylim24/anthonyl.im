import { LIMITS } from "../limits"
import { addDays, daysBetween, dayCount } from "../meta"
import type { ItineraryItem, Trip, TripAccent, TripCenter, TripDay, TripStatus } from "../types"

// Trip details as a change, not a copy. The dialog works out which fields
// the traveller touched and hands back a patch; `applyDetailsPatch` lays it
// onto whatever the trip is when the save lands, so a stop a collaborator
// added (or a rename the concierge made) while the dialog was open survives.
//
// New dates carry a decision instead of a day list: how the existing days
// map onto the range ("shift" them with the start, or "keep" each on its
// date), and what happens to stops on days that no longer fit (Ideas, or
// gone). The days are rebuilt from the current trip at apply time.

/** "shift": every day moves with the start (day 1 stays day 1). "keep": each day stays on its date. */
export type DatePlan = "shift" | "keep"
/** Stops on days that fall outside the new range: saved to the trip's Ideas, or removed. */
export type OutsideStops = "ideas" | "delete"

export interface DatesChange {
  startDate: string
  endDate: string
  plan: DatePlan
  outside: OutsideStops
}

/** Only the fields the traveller changed. `description: null` clears it. */
export interface DetailsPatch {
  name?: string
  description?: string | null
  destinations?: string[]
  center?: TripCenter
  timezone?: string
  status?: TripStatus
  accent?: TripAccent
  dates?: DatesChange
}

export interface DayFit {
  days: TripDay[]
  /** Days with no place in the new range, in trip order. */
  dropped: TripDay[]
}

/** Anything on a day that would be lost with it. */
export function dayHasPlans(day: TripDay): boolean {
  return day.items.length > 0 || Boolean(day.title?.trim() || day.notes?.trim() || day.journal?.trim())
}

/** Items a day would hand to Ideas: everything but section headings. */
export function dayStops(day: TripDay): ItineraryItem[] {
  return day.items.filter((item) => item.kind !== "section")
}

function freshIds(days: readonly TripDay[]): () => string {
  // Dropped days' ids stay reserved too: an Undo brings them back.
  const used = new Set(days.map((d) => d.id))
  let n = 0
  return () => {
    do n += 1
    while (used.has(`day-${n}`))
    used.add(`day-${n}`)
    return `day-${n}`
  }
}

/** A booking that ends on a later day (check-out, an overnight flight) moves with its day. */
function shiftItem(item: ItineraryItem, by: number): ItineraryItem {
  const reservation = item.reservation
  if (!reservation?.endDate || by === 0) return item
  return { ...item, reservation: { ...reservation, endDate: addDays(reservation.endDate, by) } }
}

/**
 * Fit the day list to a new range.
 *
 * "shift" re-dates days by position from the new start, so a trip moved a
 * day later keeps day 1 as day 1; days past the new length drop off the end.
 * "keep" leaves every day on its date; days before the new start or after
 * the new end drop. Either way, dates with no day get an empty one, and a
 * day that does not change is returned as the same object.
 */
export function fitDays(days: readonly TripDay[], startDate: string, endDate: string, plan: DatePlan): DayFit {
  const count = dayCount(startDate, endDate)
  const nextId = freshIds(days)
  const out: TripDay[] = []
  const kept = new Set<TripDay>()

  if (plan === "shift") {
    for (let i = 0; i < count; i++) {
      const date = addDays(startDate, i)
      const day = days[i]
      if (!day) {
        out.push({ id: nextId(), date, items: [] })
        continue
      }
      kept.add(day)
      if (day.date === date) {
        out.push(day)
        continue
      }
      const by = daysBetween(day.date, date)
      out.push({ ...day, date, items: day.items.map((item) => shiftItem(item, by)) })
    }
  } else {
    const byDate = new Map<string, TripDay>()
    for (const day of days) if (!byDate.has(day.date)) byDate.set(day.date, day)
    for (let i = 0; i < count; i++) {
      const date = addDays(startDate, i)
      const day = byDate.get(date)
      if (day) {
        kept.add(day)
        out.push(day)
      } else {
        out.push({ id: nextId(), date, items: [] })
      }
    }
  }
  return { days: out, dropped: days.filter((day) => !kept.has(day)) }
}

/**
 * Whether the traveller has to choose between "shift" and "keep": only when
 * the two give different plans and there is something on the days to move.
 * Moving only the end date, or re-dating an empty trip, needs no question.
 */
export function needsPlanChoice(days: readonly TripDay[], startDate: string, endDate: string): boolean {
  if (!days.some(dayHasPlans)) return false
  const shift = fitDays(days, startDate, endDate, "shift")
  const keep = fitDays(days, startDate, endDate, "keep")
  const shape = (fit: DayFit) =>
    `${fit.days.map((d) => (dayHasPlans(d) ? `${d.id}@${d.date}` : d.date)).join(",")}|${fit.dropped.filter(dayHasPlans).map((d) => d.id).join(",")}`
  return shape(shift) !== shape(keep)
}

/** How many more ideas the trip can hold (the server refuses more than `LIMITS.ideas`). */
export function ideasRoom(trip: Pick<Trip, "ideas">): number {
  return Math.max(0, LIMITS.ideas - (trip.ideas?.length ?? 0))
}

/** The patch laid onto `trip` as it is now. Pure; returns `trip` itself when the patch is empty. */
export function applyDetailsPatch(trip: Trip, patch: DetailsPatch): Trip {
  let next = trip
  const set = (fields: Partial<Trip>) => {
    next = { ...next, ...fields }
  }
  if (patch.name !== undefined) set({ name: patch.name })
  if (patch.description !== undefined) set({ description: patch.description ?? undefined })
  if (patch.destinations) set({ destinations: patch.destinations })
  if (patch.center) set({ center: patch.center })
  if (patch.timezone) set({ timezone: patch.timezone })
  if (patch.status) set({ status: patch.status })
  if (patch.accent) set({ appearance: { ...trip.appearance, accent: patch.accent } })
  if (patch.dates) {
    const { startDate, endDate, plan, outside } = patch.dates
    const fit = fitDays(trip.days, startDate, endDate, plan)
    set({ startDate, endDate, days: fit.days })
    if (outside === "ideas") {
      // The dialog only offers Ideas when everything fits; a list that
      // filled up in the meantime takes what it can rather than refusing
      // the whole save (the server caps it at LIMITS.ideas).
      const moved = fit.dropped.flatMap(dayStops).slice(0, ideasRoom(trip))
      if (moved.length > 0) set({ ideas: [...(trip.ideas ?? []), ...moved] })
    }
  }
  return next
}

/** The Undo label for a details save, and whether it is worth a toast (it took days away). */
export function detailsUndo(trip: Trip, patch: DetailsPatch): { label: string; toast?: boolean } {
  if (!patch.dates) return { label: "Updated the trip details" }
  const { startDate, endDate, plan } = patch.dates
  const lost = fitDays(trip.days, startDate, endDate, plan).dropped.some(dayHasPlans)
  return lost ? { label: "Changed the trip dates", toast: true } : { label: "Changed the trip dates" }
}
