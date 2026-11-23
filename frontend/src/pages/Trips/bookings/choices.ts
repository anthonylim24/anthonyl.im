import { dayShort } from "../conciergeProposal"
import { dayZone } from "../dayClock"
import { addDays, daysBetween } from "../meta"
import type { Trip } from "../types"
import type { BookingForm } from "./kinds"
import { zoneShortName } from "./lines"

// The choices a booking's editor offers: which day it ends on, and which
// time zone it lands in. Pure, so the lists are tested without a browser.

export interface Choice {
  /** "" clears the field. */
  value: string
  label: string
}

/** How far past the trip a stay or a car can run in the list (a late check-out after the last night). */
const LONGEST = 60

/**
 * The days a booking can end on, by kind. A flight or train lands the same
 * day, the next, the one after, or (a flight over the date line) the day
 * before; a stay checks out from the morning after check-in to the morning
 * after the trip; a car is dropped off from the same day on. A date already
 * set that the list would not offer stays in it.
 */
export function endDateChoices(form: BookingForm, start: string, tripEnd: string, current?: string): Choice[] {
  const named = (date: string, extra?: string) => ({ value: date, label: `${dayShort({ date })}${extra ? ` · ${extra}` : ""}` })
  let out: Choice[]
  if (form === "flight" || form === "ride") {
    out = [
      { value: "", label: `Same day (${dayShort({ date: start })})` },
      { value: addDays(start, 1), label: `Next day (${dayShort({ date: addDays(start, 1) })})` },
      { value: addDays(start, 2), label: `2 days later (${dayShort({ date: addDays(start, 2) })})` },
      ...(form === "flight" ? [{ value: addDays(start, -1), label: `Day before (${dayShort({ date: addDays(start, -1) })})` }] : []),
    ]
  } else {
    // A stay with no check-out lasts until the next stay; a car with none comes back the same day.
    const last = Math.min(LONGEST, Math.max(1, daysBetween(start, tripEnd) + 1))
    out = [{ value: "", label: form === "stay" ? "Not set" : `Same day (${dayShort({ date: start })})` }]
    for (let n = 1; n <= last; n++) {
      const date = addDays(start, n)
      out.push(named(date, form === "stay" ? `${n} night${n === 1 ? "" : "s"}` : undefined))
    }
  }
  if (current && !out.some((choice) => choice.value === current)) out.push(named(current))
  return out
}

/** Every zone the trip's days are lived in, the trip's own first. */
export function tripZones(trip: Pick<Trip, "timezone" | "days">): string[] {
  const zones = [dayZone(trip), ...trip.days.map((day) => dayZone(trip, day))]
  return [...new Set(zones)]
}

/** "Honolulu · HST" for a zone chip. */
export function zoneLabel(zone: string, date: string): string {
  const city = zone.split("/").pop()!.replace(/_/g, " ")
  const short = zoneShortName(date, undefined, zone)
  return short && short !== zone ? `${city} · ${short}` : city
}
