// Map a server-side ReservationType to the matching <SmartEntity> kind
// so the popover gives the user the right list of external destinations
// (restaurants → Catch Table / Naver; flights → FlightAware; etc).

import type { ReservationType } from "./types"
import type { EntityType } from "./entityLinks"

const MAP: Record<ReservationType, EntityType> = {
  flight: "flight",
  hotel: "hotel",
  meal: "restaurant",
  bar: "restaurant",
  experience: "place",
  transit: "transit",
  event: "place",
  appointment: "place",
  wedding: "place",
}

export function reservationEntityType(t: ReservationType): EntityType {
  return MAP[t] ?? "place"
}
