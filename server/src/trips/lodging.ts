import { haversineMeters } from "../data/koreaPlaces"
import type { ItineraryItem, Trip, TripDay } from "./types"

// Where the traveller sleeps shapes every day: mornings start there,
// evenings end there, and a change of hotel can turn a tidy day into two
// cross-town rides. The planner and the reviewer are told the base for each
// day, measured against that day's stops, so they plan around it.

export interface Base {
  itemId: string
  name: string
  lat?: number
  lng?: number
}

const LODGING_TYPE = /hotel|lodging|stay|hostel|resort|airbnb|rental|check[- ]?in/i

/** A place to sleep: a stop in the hotel category, or a lodging booking. */
export function isLodging(item: ItineraryItem): boolean {
  if (item.kind !== "place" && item.kind !== "reservation") return false
  if (item.location?.category === "hotel") return true
  return item.kind === "reservation" && LODGING_TYPE.test(item.reservation?.type ?? "")
}

const toBase = (item: ItineraryItem): Base => ({
  itemId: item.id,
  name: item.location?.name || item.title,
  lat: item.location?.lat,
  lng: item.location?.lng,
})

/**
 * The base for each day. A lodging item covers its own day and every day
 * after it until the next one; days before the first lodging item use that
 * first one (the hotel is usually added on the arrival day, or later).
 */
export function baseByDay(trip: Pick<Trip, "days">): Map<string, Base> {
  const out = new Map<string, Base>()
  let current: Base | undefined
  const first = trip.days.flatMap((d) => d.items).find(isLodging)
  for (const day of trip.days) {
    const here = [...day.items].reverse().find(isLodging)
    if (here) current = toBase(here)
    const base = current ?? (first ? toBase(first) : undefined)
    if (base) out.set(day.id, base)
  }
  return out
}

/**
 * Things the traveller has committed to: bookings, booked or finished stops,
 * and where they sleep. A fresh AI draft keeps these and plans around them.
 */
export function isFixed(item: ItineraryItem): boolean {
  return item.kind === "reservation" || item.status === "booked" || item.status === "completed" || isLodging(item)
}

const km = (meters: number) => Math.round(meters / 100) / 10
const located = (item: ItineraryItem) => item.location?.lat != null && item.location?.lng != null

/** How a day sits against its base: null when either side has no coordinates. */
export function baseDistances(day: TripDay, base: Base | undefined): { firstKm: number; lastKm: number; farthestKm: number } | null {
  if (!base || base.lat == null || base.lng == null) return null
  const stops = day.items.filter((item) => (item.kind === "place" || item.kind === "reservation") && located(item) && !isLodging(item))
  if (stops.length === 0) return null
  const from = { lat: base.lat, lng: base.lng }
  const to = (item: ItineraryItem) => haversineMeters(from, { lat: item.location!.lat!, lng: item.location!.lng! })
  return {
    firstKm: km(to(stops[0]!)),
    lastKm: km(to(stops[stops.length - 1]!)),
    farthestKm: km(Math.max(...stops.map(to))),
  }
}

/** One line per day for a model: the base and how far the day strays from it. */
export function describeBases(trip: Pick<Trip, "days">, days: readonly TripDay[] = trip.days): string {
  const bases = baseByDay(trip)
  if (bases.size === 0) return ""
  const lines = days.map((day) => {
    const base = bases.get(day.id)
    if (!base) return `  ${day.id} ${day.date}: no lodging known`
    const where = base.lat != null && base.lng != null ? ` (${base.lat.toFixed(5)},${base.lng.toFixed(5)})` : " (no coordinates)"
    const d = baseDistances(day, base)
    const flags: string[] = []
    if (d) {
      flags.push(`first stop ${d.firstKm} km away, last stop ${d.lastKm} km away`)
      if (d.firstKm >= 6) flags.push("! FAR START: the morning begins a long way from the base")
      if (d.lastKm >= 6) flags.push("! FAR END: the evening finishes a long way from the base")
    }
    return `  ${day.id} ${day.date}: sleeping at ${JSON.stringify(base.name)}${where}${flags.length ? `; ${flags.join("; ")}` : ""}`
  })
  return lines.join("\n")
}

/** A stable fingerprint of where the traveller sleeps, to notice a change. */
export function lodgingSignature(trip: Pick<Trip, "days">): string {
  return trip.days
    .flatMap((day) =>
      day.items
        .filter(isLodging)
        .map((item) => `${day.id}:${(item.location?.name || item.title).trim().toLowerCase()}@${item.location?.lat?.toFixed(3) ?? ""},${item.location?.lng?.toFixed(3) ?? ""}`),
    )
    .join("|")
}
