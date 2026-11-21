// Honest travel-time guesses from straight-line distance. There is no
// routing behind these: a speed per distance band plus a fixed overhead
// (waiting for a train, getting out of the city, airport time). Anything
// past a walk is labelled "≈" and never names a line or a road.

export type TravelMode = "walk" | "transit" | "road" | "flight"

export interface TravelEstimate {
  mode: TravelMode
  minutes: number
  /** "6 min walk", "≈ 35 min by transit", "≈ 2 h 10 by road or rail", "Flight · ≈ 3 h 40". */
  label: string
}

/** Legs shorter than this are the same place (DayPanel draws no leg either). */
export const MIN_LEG_METERS = 40

const WALK_MPS = 1.35
const WALK_MAX_M = 1_600
const TRANSIT_MAX_M = 40_000
const ROAD_MAX_M = 500_000
const TRANSIT_KMH = 22
const TRANSIT_OVERHEAD_MIN = 8
const ROAD_KMH = 75
const ROAD_OVERHEAD_MIN = 15
const FLIGHT_KMH = 750
const FLIGHT_OVERHEAD_MIN = 150

/** The guess is no better than five minutes either way, so it does not pretend to be. */
const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5)

const minutesAt = (km: number, kmh: number, overhead: number) => (km / kmh) * 60 + overhead

/** "45 min", "1 h", "1 h 20", "3 h". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0))
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`
}

export function travelEstimate(meters: number): TravelEstimate {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0
  const km = m / 1000
  if (m <= WALK_MAX_M) {
    const minutes = Math.max(1, Math.round(m / WALK_MPS / 60))
    return { mode: "walk", minutes, label: `${formatMinutes(minutes)} walk` }
  }
  if (m <= TRANSIT_MAX_M) {
    const minutes = roundTo5(minutesAt(km, TRANSIT_KMH, TRANSIT_OVERHEAD_MIN))
    return { mode: "transit", minutes, label: `≈ ${formatMinutes(minutes)} by transit` }
  }
  if (m <= ROAD_MAX_M) {
    const minutes = roundTo5(minutesAt(km, ROAD_KMH, ROAD_OVERHEAD_MIN))
    return { mode: "road", minutes, label: `≈ ${formatMinutes(minutes)} by road or rail` }
  }
  const minutes = roundTo5(minutesAt(km, FLIGHT_KMH, FLIGHT_OVERHEAD_MIN))
  return { mode: "flight", minutes, label: `Flight · ≈ ${formatMinutes(minutes)}` }
}
