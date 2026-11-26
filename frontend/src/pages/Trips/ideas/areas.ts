import { distanceMeters, isLocated, type LngLat } from "../map/geo"
import type { ItineraryItem, Trip } from "../types"
import { addressLocality, normaliseName, withoutNumbers } from "./address"

// What areas.ts exported before ./address took them, for code that still imports them from here.
export { addressLocality, isCountry, normaliseName, streetFirst } from "./address"

// Where a wishlist idea is, as a heading for "Group by area". Worked out
// from the trip alone, with no network: the city of the day whose stops are
// nearest, else a city of the trip named in the address, else the town the
// address ends in. Grouped by `key`, headed by `label`, ordered by `rank`
// (the trip's own order first, then other towns, then "Elsewhere", then
// "No location").

export interface Area {
  /** What groups ideas together: case, accents and spacing do not split a town. */
  key: string
  label: string
  /** Smaller first: a city's first day, then other towns, "Elsewhere", "No location". */
  rank: number
}

/** About a city across: a stop this close to a day's stops is in that day's city. */
export const AREA_RADIUS_M = 30_000

const RANK_TOWN = 100_000
export const ELSEWHERE: Area = { key: "~elsewhere", label: "Elsewhere", rank: 200_000 }
export const NO_LOCATION: Area = { key: "~none", label: "No location", rank: 300_000 }

interface TripCity {
  name: string
  norm: string
  rank: number
}

/** The trip's cities: each day's, in day order, then any destination no day names. */
function tripCities(trip: Pick<Trip, "days" | "destinations">): TripCity[] {
  const cities: TripCity[] = []
  const seen = new Set<string>()
  const add = (raw: string | undefined, rank: number) => {
    const name = raw?.split(",")[0]?.trim()
    if (!name) return
    const norm = normaliseName(name)
    if (seen.has(norm)) return
    seen.add(norm)
    cities.push({ name, norm, rank })
  }
  trip.days.forEach((day, i) => add(day.city, i))
  trip.destinations.forEach((destination, i) => add(destination, trip.days.length + i))
  return cities
}

const cityArea = (city: TripCity): Area => ({ key: city.norm, label: city.name, rank: city.rank })

/** A trip city named as a whole part of the address ("…, Jongno District, Seoul, South Korea"). */
function cityInAddress(address: string | undefined, cities: readonly TripCity[]): TripCity | null {
  if (!address) return null
  const parts = new Set(address.split(",").map((part) => normaliseName(withoutNumbers(part))))
  return cities.find((city) => parts.has(city.norm)) ?? null
}

interface DayStops {
  city: TripCity | null
  points: LngLat[]
}

/** Each day's located stops (parked and skipped ones too: they still say where the day is). */
function dayStops(trip: Pick<Trip, "days">, cities: readonly TripCity[]): DayStops[] {
  return trip.days.map((day) => {
    const norm = day.city ? normaliseName(day.city.split(",")[0] ?? "") : ""
    return {
      city: cities.find((city) => city.norm === norm) ?? null,
      points: day.items.filter(isLocated).map((item) => item.location),
    }
  })
}

function nearest(point: LngLat, days: readonly DayStops[], withCity: boolean): { city: TripCity | null; meters: number } | null {
  let best: { city: TripCity | null; meters: number } | null = null
  for (const day of days) {
    if (withCity && !day.city) continue
    for (const stop of day.points) {
      const meters = distanceMeters(point, stop)
      if (!best || meters < best.meters) best = { city: day.city, meters }
    }
  }
  return best
}

/**
 * The area of every idea, worked out once per trip: the trip's cities and
 * stops are gathered once, not per idea.
 */
export function ideaAreas(trip: Pick<Trip, "days" | "destinations">, ideas: readonly ItineraryItem[]): Map<string, Area> {
  const cities = tripCities(trip)
  const days = dayStops(trip, cities)
  const areas = new Map<string, Area>()
  for (const idea of ideas) areas.set(idea.id, areaWith(idea, cities, days))
  return areas
}

/** One idea's area. Prefer `ideaAreas` for a whole list. */
export function areaOf(idea: ItineraryItem, trip: Pick<Trip, "days" | "destinations">): Area {
  const cities = tripCities(trip)
  return areaWith(idea, cities, dayStops(trip, cities))
}

function areaWith(idea: ItineraryItem, cities: readonly TripCity[], days: readonly DayStops[]): Area {
  const address = idea.location?.address
  if (isLocated(idea)) {
    const point = idea.location
    const close = nearest(point, days, false)
    if (close && close.meters <= AREA_RADIUS_M) {
      if (close.city) return cityArea(close.city)
      // The nearest stop is on a day with no city: the nearest day that has one, if it is close too.
      const named = nearest(point, days, true)
      if (named?.city && named.meters <= AREA_RADIUS_M) return cityArea(named.city)
    }
  }
  const named = cityInAddress(address, cities)
  if (named) return cityArea(named)
  const town = addressLocality(address)
  if (town) return { key: normaliseName(town), label: town, rank: RANK_TOWN }
  return isLocated(idea) || address?.trim() ? ELSEWHERE : NO_LOCATION
}

/** Areas in heading order: the trip's cities by first day, then other towns A to Z, then the two catch-alls. */
export function compareAreas(x: Area, y: Area): number {
  return x.rank - y.rank || x.label.localeCompare(y.label)
}
