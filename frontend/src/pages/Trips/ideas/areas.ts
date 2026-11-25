import { distanceMeters, isLocated, type LngLat } from "../map/geo"
import type { ItineraryItem, Trip } from "../types"

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

/** Lower case, no accents, single spaces: "Lisboa " and "lisboa" are one town. */
export function normaliseName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** A comma-separated part of an address with its postcode and house numbers taken out ("1300-085 Lisboa" → "Lisboa"). */
function withoutNumbers(part: string): string {
  return part
    .split(/\s+/)
    .filter((token) => !/\d/.test(token))
    .join(" ")
    .trim()
}

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

let countries: Set<string> | null = null

/** Country names as an address ends with them, in English and a few local spellings. */
function countryNames(): Set<string> {
  if (countries) return countries
  const names = new Set<string>([
    "usa",
    "us",
    "united states of america",
    "uk",
    "uae",
    "korea",
    "republic of korea",
    "대한민국",
    "한국",
    "日本",
    "中国",
    "turkey",
    "czech republic",
    "hong kong",
    "macau",
    "españa",
    "deutschland",
    "italia",
    "brasil",
    "méxico",
    "nederland",
    "schweiz",
    "österreich",
  ].map(normaliseName))
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" })
    const A = "A".charCodeAt(0)
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j)
        const name = display.of(code)
        if (name && name !== code) names.add(normaliseName(name))
      }
    }
  } catch {
    // No Intl.DisplayNames: the short list above still drops the usual ones.
  }
  countries = names
  return names
}

/** Whether a name, or a part of an address, is a country ("Japan", "South Korea", "대한민국"). */
export const isCountry = (part: string) => countryNames().has(normaliseName(withoutNumbers(part)))
/** A part that is a postcode and nothing else ("603-8361", "〒150-0041"); "1-chōme-22-7" is a street. */
const isPostcode = (part: string) => /^〒?\s*\d[\d\s-]*$/.test(part)

/**
 * An address's parts street first, without the country or a part that is
 * only a postcode. Google writes some addresses country first ("Japan,
 * 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme-22-7"): those are turned round
 * ("1-chōme-22-7, Jinnan, Shibuya, 〒150-0041 Tokyo").
 */
export function streetFirst(address: string | undefined): string[] {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1 && isCountry(parts[0]!)) parts.reverse()
  while (parts.length > 0 && isCountry(parts[parts.length - 1]!)) parts.pop()
  return parts.filter((part) => !isPostcode(part))
}

/**
 * The town an address ends in: the last part before the country, without
 * its postcode, skipping a state code ("New York, NY 10001, USA" → "New
 * York"). Needs at least two parts, so a lone street or venue name is not
 * mistaken for a town; null when nothing is left.
 */
export function addressLocality(address: string | undefined): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const rest = streetFirst(address).map(withoutNumbers)
  while (rest.length > 0 && rest[rest.length - 1] === "") rest.pop()
  while (rest.length > 1 && (rest[rest.length - 1] === "" || /^[A-Z]{2,3}$/.test(rest[rest.length - 1]!))) rest.pop()
  const town = rest[rest.length - 1]
  return town && !/^[A-Z]{2,3}$/.test(town) ? town : null
}

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
