import { nameKey } from "../geocode"
import { distanceMeters } from "../map/geo"
import { formatTripDate, plural } from "../meta"
import { dayFull } from "../tripEdits"
import type { ItineraryItem, Trip, TripDay } from "../types"
import type { DayChoice } from "../workspace/DayPicker"

/** Same-named stops further apart than this are different places (two branches of a chain). */
const SAME_PLACE_METERS = 300

const placeName = (item: ItineraryItem) => nameKey(item.location?.name || item.title)

/** Whether `day` already has `idea` on it: the same stop, the same Google place, or the same name at the same spot. */
export function dayHolds(day: TripDay, idea: ItineraryItem): boolean {
  const name = placeName(idea)
  const at = idea.location
  return day.items.some((item) => {
    if (item.kind === "note" || item.kind === "section") return false
    if (item.id === idea.id) return true
    if (at?.placeId && item.location?.placeId) return at.placeId === item.location.placeId
    if (!name || placeName(item) !== name) return false
    const here = item.location
    if (at?.lat == null || at.lng == null || here?.lat == null || here.lng == null) return true
    return distanceMeters({ lat: at.lat, lng: at.lng }, { lat: here.lat, lng: here.lng }) <= SAME_PLACE_METERS
  })
}

/**
 * Every day of the trip as a place to send an idea: "Day 3 · Sat, Nov 14",
 * "Kyoto · 4 stops". Full days, and days that already have the place, show but are off.
 */
export function ideaDayChoices(trip: Pick<Trip, "days" | "timezone">, idea?: ItineraryItem): DayChoice[] {
  return trip.days.map((day, i) => ({
    id: day.id,
    label: `Day ${i + 1} · ${formatTripDate(day.date, day.timezone ?? trip.timezone)}`,
    detail: [day.city, plural(day.items.filter((item) => item.kind !== "section").length, "stop")].filter(Boolean).join(" · "),
    off: idea && dayHolds(day, idea) ? "Already on this day" : dayFull(day) ? "Full" : undefined,
  }))
}
