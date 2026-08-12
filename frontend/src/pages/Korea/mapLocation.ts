/**
 * Map Mode location resolution.
 *
 * When the device is outside the day's itinerary area, the scene anchors
 * at the median center of that day's places so Map Mode stays useful
 * during planning from abroad. Inside the area, live geolocation wins.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** Radius (m) around the day median that counts as "in the trip area".
 *  ~80 km covers a full Seoul/Busan metro day with margin for GPS error
 *  and day-trip outliers without treating SF / Europe as "here". */
export const TRIP_AREA_RADIUS_M = 80_000

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Geometric median via coordinate-wise median (robust to outliers). */
export function medianLatLng(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null
  const lats = points.map((p) => p.lat).slice().sort((a, b) => a - b)
  const lngs = points.map((p) => p.lng).slice().sort((a, b) => a - b)
  const mid = Math.floor(lats.length / 2)
  if (lats.length % 2 === 1) {
    return { lat: lats[mid], lng: lngs[mid] }
  }
  return {
    lat: (lats[mid - 1] + lats[mid]) / 2,
    lng: (lngs[mid - 1] + lngs[mid]) / 2,
  }
}

export function isInTripArea(
  device: LatLng,
  dayCenter: LatLng,
  radiusM: number = TRIP_AREA_RADIUS_M,
): boolean {
  return haversineMeters(device, dayCenter) <= radiusM
}

export type ResolvedMapLocationSource = "geolocation" | "day-center"

export interface ResolvedMapLocation extends LatLng {
  source: ResolvedMapLocationSource
  label: string
}

/**
 * Choose the Map Mode anchor after places (and optional device coords) are known.
 * Prefers live geolocation when inside the day's area; otherwise day median
 * (falling back to hotel/meta center when the day has no located places).
 */
export function resolveMapLocation(opts: {
  device: LatLng | null
  places: LatLng[]
  fallbackCenter: LatLng | null
  fallbackLabel?: string
}): ResolvedMapLocation | null {
  const median = medianLatLng(opts.places)
  const dayCenter = median ?? opts.fallbackCenter
  if (!dayCenter) return null

  const dayLabel = opts.fallbackLabel?.trim() || "Day center"

  if (opts.device && isInTripArea(opts.device, dayCenter)) {
    return {
      lat: opts.device.lat,
      lng: opts.device.lng,
      source: "geolocation",
      label: "You",
    }
  }

  return {
    lat: dayCenter.lat,
    lng: dayCenter.lng,
    source: "day-center",
    label: median ? "Day center" : dayLabel,
  }
}

export function coordsEqual(
  a: LatLng | null | undefined,
  b: LatLng | null | undefined,
  epsilon = 1e-7,
): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.lat - b.lat) < epsilon && Math.abs(a.lng - b.lng) < epsilon
}
