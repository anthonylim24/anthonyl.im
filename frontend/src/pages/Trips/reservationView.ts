import type { Reservation, ReservationStatus, ReservationType } from "../Korea/types"
import type { ItineraryItem, TripDay, TripLocation } from "./types"

const TYPES: readonly ReservationType[] = [
  "flight",
  "hotel",
  "meal",
  "bar",
  "experience",
  "transit",
  "event",
  "appointment",
  "wedding",
]

const EARTH_M = 6_371_000
const WALK_MPS = 1.35

function asType(value: string | undefined): ReservationType {
  return TYPES.includes(value as ReservationType) ? (value as ReservationType) : "experience"
}

function asStatus(value: string | undefined): ReservationStatus {
  if (value === "confirmed" || value === "tentative" || value === "pending") return value
  return "pending"
}

function reservationNotes(item: ItineraryItem): string | undefined {
  const conf = item.reservation?.confirmation?.trim()
  const parts = [item.notes, conf ? `Confirmation ${conf}` : undefined].filter(
    (part): part is string => Boolean(part),
  )
  return parts.length > 0 ? parts.join("\n") : undefined
}

function reservationSubtitle(item: ItineraryItem): string | undefined {
  const locationName = item.location?.name?.trim()
  const place = locationName && locationName !== item.title.trim() ? locationName : undefined
  const until = item.endTime ? `Until ${item.endTime}` : undefined
  const parts = [place, until].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(" · ") : undefined
}

/** Project a trip reservation item onto the Korea card shape. */
export function itemToReservation(item: ItineraryItem, day: TripDay, dayNumber: number): Reservation | null {
  if (item.kind !== "reservation") return null
  return {
    id: item.id,
    date: day.date,
    time: item.time,
    type: asType(item.reservation?.type),
    status: asStatus(item.reservation?.status),
    title: item.title,
    subtitle: reservationSubtitle(item),
    address: item.location?.address,
    contact: item.reservation?.contact ?? item.reservation?.url ?? item.links?.[0],
    url: item.reservation?.url ?? item.links?.[0],
    notes: reservationNotes(item),
    dayNumber,
  }
}

export function upcomingReservations(
  days: readonly TripDay[],
  today: string,
): Array<{ day: TripDay; item: ItineraryItem; index: number }> {
  const out: Array<{ day: TripDay; item: ItineraryItem; index: number }> = []
  days.forEach((day, index) => {
    if (day.date < today) return
    for (const item of day.items) {
      if (item.kind === "reservation") out.push({ day, item, index })
    }
  })
  return out
}

export function haversineMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

export function formatWalkMinutes(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / WALK_MPS / 60))
  if (minutes < 60) return `${minutes} min walk`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h walk` : `${hours}h ${rem}m walk`
}

export function walkLegBetween(
  from: Pick<TripLocation, "lat" | "lng"> | undefined,
  to: Pick<TripLocation, "lat" | "lng"> | undefined,
): { distance: string; walk: string } | null {
  if (from?.lat == null || from.lng == null || to?.lat == null || to.lng == null) return null
  const meters = haversineMeters({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng })
  if (meters < 30) return null
  return { distance: formatDistance(meters), walk: formatWalkMinutes(meters) }
}

/** Next mapped stop after `item` in itinerary order, for walk/time pills. */
export function nextMappedItem(
  items: readonly ItineraryItem[],
  itemId: string,
): ItineraryItem | undefined {
  const start = items.findIndex((item) => item.id === itemId)
  if (start < 0) return undefined
  for (let i = start + 1; i < items.length; i++) {
    const loc = items[i]?.location
    if (loc?.lat != null && loc.lng != null) return items[i]
  }
  return undefined
}
