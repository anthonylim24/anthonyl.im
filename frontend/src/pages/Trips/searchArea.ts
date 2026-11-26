import { NO_ANCHORS, addressTowns, nameKey, townKey, type PlaceResult, type TripAnchors } from "./geocode"
import { dayRoute, distanceMeters, isLocated, searchCenter, type LngLat } from "./map/geo"
import { dayStays } from "./map/stayPins"
import { isCountry } from "./ideas/address"
import type { Trip } from "./types"

// Near is any of the trip's places or towns, so the second city of a
// two-city trip is as local as the first. TripWorkspace works these out once
// per edit; every place field on the page reads them.

export interface StopOnDay {
  /** 1-based, as the trip names its days. */
  day: number
  /** `nameKey` of its place name. */
  key: string
  placeId: string | null
  lat: number
  lng: number
}

export interface TripPlaces {
  anchors: TripAnchors
  stops: readonly StopOnDay[]
}

export const NO_TRIP_PLACES: TripPlaces = { anchors: NO_ANCHORS, stops: [] }

/** Two places this close with the same name are one. */
const SAME_PLACE_M = 300

type TripForSearch = Pick<Trip, "days" | "destinations" | "ideas" | "center">

export function tripPlaces(trip: TripForSearch | null): TripPlaces {
  if (!trip) return NO_TRIP_PLACES
  const points: LngLat[] = trip.center ? [trip.center] : []
  const stops: StopOnDay[] = []
  trip.days.forEach((day, index) => {
    for (const item of day.items) {
      if (!isLocated(item)) continue
      points.push({ lat: item.location.lat, lng: item.location.lng })
      stops.push({
        day: index + 1,
        key: nameKey(item.location.name || item.title),
        placeId: item.location.placeId ?? null,
        lat: item.location.lat,
        lng: item.location.lng,
      })
    }
  })
  for (const idea of trip.ideas ?? []) if (isLocated(idea)) points.push({ lat: idea.location.lat, lng: idea.location.lng })
  // A country is no town: "Japan" would make every same-named place in it near.
  const named = [...trip.destinations, ...trip.days.map((day) => day.city ?? "")].filter((name) => !isCountry(name.split(",")[0]!))
  const towns = new Set(named.map(townKey).filter(Boolean))
  return { anchors: { points, towns: [...towns] }, stops }
}

/** The day a result is already on, by its Google place id or its name at the same spot; null when no day holds it. */
export function dayHolding(place: PlaceResult, stops: readonly StopOnDay[]): number | null {
  const key = nameKey(place.name)
  const stop = stops.find(
    (stop) => (place.placeId !== undefined && stop.placeId === place.placeId) || (stop.key === key && distanceMeters(stop, place) < SAME_PLACE_M),
  )
  return stop?.day ?? null
}

/** Day indexes by distance from `from`, the earlier first on a tie; `from` itself is left out. */
function nearestDays(count: number, from: number): number[] {
  const out: number[] = []
  for (let step = 1; step < count; step++) {
    for (const index of [from - step, from + step]) if (index >= 0 && index < count) out.push(index)
  }
  return out
}

/**
 * The point a day's searches are biased to: the middle of its stops. A day
 * with none looks in its own city first, when it names one: the nearest day
 * in that city with stops (a hotel booked there is one), then the trip's
 * places whose address names the city (a stay, a wishlist place). Then where
 * the traveller sleeps that night (or woke up), the nearest day with stops
 * (the earlier on a tie), else `fallback`. A trip planned in order fills its
 * first city before its second, so without the city an empty day there
 * would search the first city's last planned day.
 */
export function dayBias(trip: Pick<Trip, "days" | "ideas">, dayIndex: number, fallback: LngLat | null): LngLat | null {
  const own = trip.days[dayIndex]
  if (!own) return fallback
  const route = dayRoute(own)
  if (route.length > 0) return searchCenter(route, fallback)
  const order = nearestDays(trip.days.length, dayIndex)
  const town = townKey(own.city ?? "")
  if (town) {
    for (const index of order) {
      const day = trip.days[index]!
      const there = townKey(day.city ?? "") === town ? dayRoute(day) : []
      if (there.length > 0) return searchCenter(there, fallback)
    }
    const named = [...trip.days.flatMap((day) => day.items), ...(trip.ideas ?? [])].flatMap((item) =>
      isLocated(item) && addressTowns(item.location.address ?? "").includes(town) ? [{ lat: item.location.lat, lng: item.location.lng }] : [],
    )
    if (named.length > 0) return searchCenter(named, fallback)
  }
  const stays = dayStays(trip, dayIndex)
  const stay = (stays.find((s) => s.role !== "last") ?? stays[0])?.item.location
  if (stay) return { lat: stay.lat, lng: stay.lng }
  for (const index of order) {
    const near = dayRoute(trip.days[index]!)
    if (near.length > 0) return searchCenter(near, fallback)
  }
  return fallback
}
