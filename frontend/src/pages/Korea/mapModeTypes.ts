export type PlacePriority = "scheduled" | "core" | "supplemental"
export type BusynessLevel = "quiet" | "moderate" | "busy" | "very_busy"

export interface RankedPlace {
  id: string
  name: string
  category: string
  icon: string
  color: string
  lat: number
  lng: number
  city: string
  address?: string
  description: string
  photoUrl: string
  openingHours?: string
  notice?: string
  priority: PlacePriority
  reason: string
  reservationId?: string
  reservationTime?: string
  distanceMeters?: number
  distanceLabel?: string
  subcategory?: "instagram"
  instagramUrl?: string
  instagramShortcode?: string
  busyness?: BusynessLevel | null
}

export interface IgSave {
  id: number
  name: string
  name_romanized?: string | null
  category: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  confidence_band: "high" | "medium" | "low"
  instagramUrl: string
  instagramShortcode?: string | null
  ownerUsername?: string | null
  captionSnippet?: string | null
}

export interface NeighborhoodCenter {
  name: string
  lat: number
  lng: number
  radiusM: number
  /** Closed outer ring as [lng, lat][] (GeoJSON convention; first === last).
   *  Drawn by Map Mode as a terrain-conforming polygon highlight. */
  polygon: [number, number][]
}

export interface PlacesResponse {
  meta: {
    slug: string
    testMode: boolean
    city: string
    day?: { n: number; title: string; hotel: string }
    center?: { lat: number; lng: number; label: string }
  }
  places: RankedPlace[]
  igSaves: IgSave[]
  /** Neighborhoods the day's itinerary covers. Map Mode renders a mild
   *  ground highlight around each so the user can see at a glance which
   *  parts of the city today is centered on. May be empty if the day's
   *  neighborhoods aren't in the lookup table (e.g. a rural site). */
  neighborhoods: NeighborhoodCenter[]
}

export interface UserLocation {
  lat: number
  lng: number
  label?: string
  source: "geolocation" | "test-anchor" | "hotel"
}
