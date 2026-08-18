import type { Trip } from "./types"

/** Average of located stops, preferring the focused day. Used as Gemini Maps `retrievalConfig.latLng`. */
export function tripLatLngHint(trip: Trip, dayId?: string): { latitude: number; longitude: number } | null {
  const focused = dayId ? trip.days.filter((d) => d.id === dayId) : []
  const pools = focused.length ? [focused, trip.days] : [trip.days]
  for (const days of pools) {
    const pts: Array<{ lat: number; lng: number }> = []
    for (const day of days) {
      for (const item of day.items) {
        const lat = item.location?.lat
        const lng = item.location?.lng
        if (typeof lat === "number" && typeof lng === "number") pts.push({ lat, lng })
      }
    }
    if (pts.length === 0) continue
    return {
      latitude: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      longitude: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    }
  }
  return null
}
