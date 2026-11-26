import { isLodgingType } from "../lodging"
import type { LngLat } from "../map/geo"
import type { ItineraryItem, Trip, TripDay } from "../types"

// An area's stops on the trip as it is now. The server groups stops once
// and names them by id; renames, moves between days and deletions since are
// read here, so the counts and the list never go stale.

/** A stop the server groups: on a day, not a heading, not skipped, with a point. Mirrors `areaStops` on the server. */
export function isAreaStop(item: ItineraryItem): item is ItineraryItem & { location: LngLat & { name: string } } {
  const where = item.location
  return (
    item.kind !== "section" &&
    item.status !== "skipped" &&
    typeof where?.lat === "number" &&
    Number.isFinite(where.lat) &&
    typeof where.lng === "number" &&
    Number.isFinite(where.lng)
  )
}

/** Which stops there are and where, not their order or day: the grouping changes only when this does (the server's `stopsHash`). */
export function areaFingerprint(trip: Pick<Trip, "days">): string {
  return trip.days
    .flatMap((day) => day.items.filter(isAreaStop).map((item) => `${item.id}|${item.location.lat.toFixed(5)}|${item.location.lng.toFixed(5)}`))
    .sort()
    .join(";")
}

export const hasAreaStops = (trip: Pick<Trip, "days">) => trip.days.some((day) => day.items.some(isAreaStop))

export interface AreaDay {
  day: TripDay
  /** 1-based. */
  dayNumber: number
  stops: Array<ItineraryItem & { location: LngLat & { name: string } }>
}

/** The area's stops still on the trip, by day, in plan order. */
export function areaDays(trip: Pick<Trip, "days">, stopIds: readonly string[]): AreaDay[] {
  const wanted = new Set(stopIds)
  return trip.days.flatMap((day, i) => {
    const stops = day.items.filter((item) => wanted.has(item.id) && isAreaStop(item)) as AreaDay["stops"]
    return stops.length > 0 ? [{ day, dayNumber: i + 1, stops }] : []
  })
}

export const areaPoints = (days: readonly AreaDay[]): LngLat[] => days.flatMap(({ stops }) => stops.map(({ location }) => ({ lat: location.lat, lng: location.lng })))

/** "Day 2", "Days 2, 9", "Days 1–3, 5": three days in a row or more read as a range. */
export function dayRuns(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  if (sorted.length === 0) return ""
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`)
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]))
    i = j + 1
  }
  return `${sorted.length === 1 ? "Day" : "Days"} ${parts.join(", ")}`
}

/**
 * A night's stay, not a visit: a lodging booking, or a hotel stop that is no
 * booking at all ("Stay: Park Hyatt Seoul"). A dinner or a wedding booked at
 * a hotel is a visit.
 */
export function isStay(item: ItineraryItem): boolean {
  const booked = item.kind === "reservation" || item.reservation !== undefined
  return booked ? isLodgingType(item.reservation?.type) : item.location?.category === "hotel"
}

/**
 * "Days 2, 9 · 7 stops", and "· Where you stay" when the hotel is in it. A
 * stay is listed on each night, so it neither counts as a stop nor stretches
 * the days: the area where the hotel is would read "Days 1–9" otherwise.
 */
export function areaMeta(days: readonly AreaDay[]): string {
  const visits = days.flatMap(({ dayNumber, stops }) => stops.filter((stop) => !isStay(stop)).map(() => dayNumber))
  const stays = days.filter(({ stops }) => stops.some(isStay)).map((d) => d.dayNumber)
  if (visits.length === 0) return `Where you stay · ${dayRuns(stays)}`
  return [dayRuns(visits), visits.length === 1 ? "1 stop" : `${visits.length} stops`, stays.length > 0 ? "Where you stay" : null].filter(Boolean).join(" · ")
}
