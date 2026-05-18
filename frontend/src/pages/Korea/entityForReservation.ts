// Map a server-side ReservationType to the matching <SmartEntity> kind
// so the popover gives the user the right list of external destinations
// (restaurants → Catch Table / Naver; flights → FlightAware; etc).

import type { ReservationType } from "./types"
import type { EntityType } from "./entityLinks"

const RESERVATION_MAP: Record<ReservationType, EntityType> = {
  flight: "flight",
  hotel: "hotel",
  meal: "restaurant",
  bar: "bar",
  experience: "experience",
  transit: "transit",
  event: "experience",
  appointment: "place",
  wedding: "venue",
}

export function reservationEntityType(t: ReservationType): EntityType {
  return RESERVATION_MAP[t] ?? "place"
}

// Maps the MapMode place.category strings (server-defined) to our
// EntityType union. Used when SmartEntity wraps places surfaced from
// the Map Mode dataset (callout text, etc).
const PLACE_CATEGORY_MAP: Record<string, EntityType> = {
  hotel: "hotel",
  palace: "palace",
  museum: "museum",
  shrine: "shrine",
  market: "market",
  shopping: "shopping",
  cafe: "cafe",
  restaurant: "restaurant",
  bar: "bar",
  park: "park",
  viewpoint: "viewpoint",
  experience: "experience",
  transit: "transit",
  neighborhood: "neighborhood",
  venue: "venue",
}

export function placeCategoryToEntityType(category: string): EntityType {
  return PLACE_CATEGORY_MAP[category] ?? "place"
}
