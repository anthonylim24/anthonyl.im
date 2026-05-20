export type PlacePriority = "scheduled" | "core" | "supplemental"

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
}

export interface UserLocation {
  lat: number
  lng: number
  label?: string
  source: "geolocation" | "test-anchor" | "hotel"
}
