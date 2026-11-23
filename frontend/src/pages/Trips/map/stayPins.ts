import { nightsByDay } from "../lodging"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { distanceMeters, isLocated, type AtlasPin, type LngLat } from "./geo"

// Where the traveller sleeps, on the day map: the reference point the rest of
// the day is read against. Pure, like geo.ts, so pages and tests can use it
// without the map chunk. `dayPins` stays the day's own stops (the timeline
// takes its numbers from it); this module only adds to what the map draws.

/** How the stay sits around the day: woke up there, sleeps there tonight, or both. */
export type StayRole = "last" | "tonight" | "both"

export interface DayStay {
  item: ItineraryItem & { location: LngLat & { name: string } }
  role: StayRole
}

/** A hotel booked twice (two reservations, a copied stay) is one place. */
const SAME_PLACE_M = 60

/**
 * A hotel further than this from every stop is a day trip's base: drawn, but
 * left out of the frame, so a day in Busan is not zoomed out to show Seoul.
 */
export const STAY_FRAME_M = 25_000

const samePlace = (x: LngLat, y: LngLat) => distanceMeters(x, y) < SAME_PLACE_M

/**
 * Where the traveller wakes up and where they sleep on day `dayIndex`, by
 * `nightsByDay` (lodging.ts): one stay on most days, two on a day they move,
 * none before the first booking. Stays with no point on the map are left out.
 */
export function dayStays(trip: Pick<Trip, "days">, dayIndex: number): DayStay[] {
  const nights = nightsByDay(trip)
  const stayOn = (index: number): DayStay["item"] | null => {
    const day = trip.days[index]
    const night = day && nights.get(day.id)
    if (!night) return null
    const item = trip.days.find((d) => d.id === night.dayId)?.items.find((i) => i.id === night.itemId)
    return item && isLocated(item) ? item : null
  }
  const last = stayOn(dayIndex - 1)
  const tonight = stayOn(dayIndex)
  if (last && tonight && (last.id === tonight.id || samePlace(last.location, tonight.location))) return [{ item: tonight, role: "both" }]
  const out: DayStay[] = []
  if (last) out.push({ item: last, role: "last" })
  if (tonight) out.push({ item: tonight, role: "tonight" })
  return out
}

const ROLE_WORDS: Record<StayRole, string> = {
  both: "where you’re staying",
  last: "where you stayed last night",
  tonight: "where you sleep tonight",
}

/** The place card's eyebrow for a stay picked on the map. */
export const STAY_LEAD: Record<StayRole, string> = {
  both: "Where you’re staying",
  last: "Last night’s stay",
  tonight: "Tonight’s stay",
}

export const stayName = (item: DayStay["item"]) => (item.location.name || item.title).trim()

/**
 * The day's pins with its stays on them. A stay booked on the day (the
 * check-in) is already one of its stops: it keeps its number and gains the
 * hotel mark (`lodging`). Any other stay is a `hotel` pin under the item's
 * own id, so picking it opens that stay like any stop. Only the stays
 * themselves are marked, never every lodging-looking stop: a train booked
 * from the hotel's door is not where anyone sleeps.
 */
export function withStays(day: Pick<TripDay, "items">, stays: readonly DayStay[], pins: readonly AtlasPin[]): AtlasPin[] {
  const stayIds = new Set(stays.map((stay) => stay.item.id))
  const out = pins.map((pin) => (pin.variant === "stop" && stayIds.has(pin.id) ? { ...pin, lodging: true } : pin))
  const onDay = new Set(day.items.map((item) => item.id))
  for (const { item, role } of stays) {
    if (onDay.has(item.id)) continue
    out.push({
      id: item.id,
      lat: item.location.lat,
      lng: item.location.lng,
      title: `${stayName(item)}, ${ROLE_WORDS[role]}`,
      variant: "hotel",
    })
  }
  return out
}

/** The hotel pins worth framing with the day: near one of its stops, or all of them on a day with none. */
export function framedStays(hotels: readonly AtlasPin[], stops: readonly LngLat[]): AtlasPin[] {
  if (stops.length === 0) return [...hotels]
  return hotels.filter((hotel) => stops.some((stop) => distanceMeters(hotel, stop) <= STAY_FRAME_M))
}
