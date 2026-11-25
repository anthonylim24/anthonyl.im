import { NO_ANCHORS, nameKey, townKey, type PlaceResult, type TripAnchors } from "./geocode"
import { dayRoute, distanceMeters, isLocated, searchCenter, type LngLat } from "./map/geo"
import { dayStays } from "./map/stayPins"
import { isCountry } from "./ideas/areas"
import type { Trip } from "./types"

// Where a place search on a trip's page looks, and what it measures "near
// the trip" against. The search is biased to one point: the open day's
// stops, or for an empty day its hotel or the nearest day with stops. Near
// is any of the trip's places or towns, so the second city of a two-city
// trip is as local as the first. Pure: TripWorkspace works these out once
// per edit and every place field on the page reads them.

/** A stop on a day, as a search result is compared with it. */
export interface StopOnDay {
  /** 1-based, as the trip names its days. */
  day: number
  /** `nameKey` of its place name. */
  key: string
  placeId: string | null
  lat: number
  lng: number
}

/** What the trip already has, for every place search on its page. */
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

/**
 * The point a day's searches are biased to: the middle of its stops; for a
 * day with none, where the traveller sleeps that night (or woke up), else
 * the nearest day that has stops (the earlier on a tie), else `fallback`.
 */
export function dayBias(trip: Pick<Trip, "days">, dayIndex: number, fallback: LngLat | null): LngLat | null {
  const own = trip.days[dayIndex]
  if (!own) return fallback
  const route = dayRoute(own)
  if (route.length > 0) return searchCenter(route, fallback)
  const stays = dayStays(trip, dayIndex)
  const stay = (stays.find((s) => s.role !== "last") ?? stays[0])?.item.location
  if (stay) return { lat: stay.lat, lng: stay.lng }
  for (let step = 1; step < trip.days.length; step++) {
    for (const index of [dayIndex - step, dayIndex + step]) {
      const day = trip.days[index]
      const near = day ? dayRoute(day) : []
      if (near.length > 0) return searchCenter(near, fallback)
    }
  }
  return fallback
}
