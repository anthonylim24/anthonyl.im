import type { ItineraryItem, Trip } from "./types"

export const UNSPECIFIED_CITY = "Unspecified city"
export const UNSPECIFIED_NEIGHBORHOOD = "Unspecified neighborhood"

export interface CatalogPlace {
  tripId: string
  tripName: string
  tripSlug?: string
  dayId: string
  dayTitle?: string
  date: string
  city: string
  neighborhood: string
  itemId: string
  name: string
  address?: string
  category?: string
  lat?: number
  lng?: number
  sourceUrl?: string
}

export interface CatalogNeighborhoodGroup {
  neighborhood: string
  places: CatalogPlace[]
}

export interface CatalogCityGroup {
  city: string
  neighborhoods: CatalogNeighborhoodGroup[]
}

export interface CatalogTripGroup {
  tripId: string
  tripName: string
  tripSlug?: string
  cities: CatalogCityGroup[]
}

export function instagramSourceUrl(item: ItineraryItem): string | undefined {
  return item.links?.find((l) => /instagram\.com/i.test(l))
}

/** Flatten Instagram-sourced places across trips, sorted for grouping. */
export function collectCatalogPlaces(trips: Trip[]): CatalogPlace[] {
  const out: CatalogPlace[] = []
  for (const trip of trips) {
    for (const day of trip.days) {
      const city = day.city?.trim() || UNSPECIFIED_CITY
      const neighborhood =
        day.neighborhoods?.map((n) => n.trim()).filter(Boolean).join(" · ") || UNSPECIFIED_NEIGHBORHOOD
      for (const item of day.items) {
        if (item.kind !== "place") continue
        const sourceUrl = instagramSourceUrl(item)
        if (!sourceUrl) continue
        out.push({
          tripId: trip.id,
          tripName: trip.name,
          tripSlug: trip.slug,
          dayId: day.id,
          dayTitle: day.title,
          date: day.date,
          city,
          neighborhood,
          itemId: item.id,
          name: item.location?.name?.trim() || item.title,
          address: item.location?.address,
          category: item.location?.category,
          lat: item.location?.lat,
          lng: item.location?.lng,
          sourceUrl,
        })
      }
    }
  }
  return out.toSorted(
    (a, b) =>
      a.tripName.localeCompare(b.tripName) ||
      a.city.localeCompare(b.city) ||
      a.neighborhood.localeCompare(b.neighborhood) ||
      a.name.localeCompare(b.name),
  )
}

/** Nest a (usually already-sorted) slice into trip → city → neighborhood. */
export function groupCatalogPlaces(places: CatalogPlace[]): CatalogTripGroup[] {
  const trips: CatalogTripGroup[] = []
  const tripIndex = new Map<string, CatalogTripGroup>()

  for (const place of places) {
    let trip = tripIndex.get(place.tripId)
    if (!trip) {
      trip = {
        tripId: place.tripId,
        tripName: place.tripName,
        tripSlug: place.tripSlug,
        cities: [],
      }
      tripIndex.set(place.tripId, trip)
      trips.push(trip)
    }
    let city = trip.cities.find((c) => c.city === place.city)
    if (!city) {
      city = { city: place.city, neighborhoods: [] }
      trip.cities.push(city)
    }
    let hood = city.neighborhoods.find((n) => n.neighborhood === place.neighborhood)
    if (!hood) {
      hood = { neighborhood: place.neighborhood, places: [] }
      city.neighborhoods.push(hood)
    }
    hood.places.push(place)
  }
  return trips
}
