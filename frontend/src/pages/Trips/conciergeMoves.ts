import type { ConciergeMove, ConciergePlace } from "../../lib/conciergeGrounding"
import type { ItineraryItem, Trip, TripDay } from "./types"

export interface TripStop {
  day: TripDay
  item: ItineraryItem
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stopNames(item: ItineraryItem): string[] {
  const names = [item.title, item.location?.name].filter((n): n is string => Boolean(n?.trim()))
  return [...new Set(names)]
}

function isStopItem(item: ItineraryItem): boolean {
  return item.kind === "place" || item.kind === "reservation"
}

function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    const host = url.hostname.toLowerCase()
    if (host === "maps.google.com" || host === "www.maps.google.com") return true
    return (host === "google.com" || host === "www.google.com") && url.pathname.startsWith("/maps")
  } catch {
    return false
  }
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

function minMatchLength(value: string): number {
  return CJK.test(value) ? 2 : 4
}

function namesMatch(query: string, candidate: string): boolean {
  const a = normalizeName(query)
  const b = normalizeName(candidate)
  if (!a || !b) return false
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  return shorter.length >= minMatchLength(shorter) && longer.includes(shorter)
}

export function dayLabel(day: TripDay, index: number): string {
  return day.title?.trim() || `Day ${index + 1}`
}

export function findTripStop(trip: Trip, name: string, dayId?: string): TripStop | null {
  const pools = dayId
    ? [...trip.days.filter((d) => d.id === dayId), ...trip.days.filter((d) => d.id !== dayId)]
    : trip.days
  for (const day of pools) {
    for (const item of day.items) {
      if (!isStopItem(item)) continue
      if (stopNames(item).some((n) => namesMatch(name, n))) return { day, item }
    }
  }
  return null
}

export function findMentionedStops(text: string, trip: Trip, excludeNames: Iterable<string> = []): TripStop[] {
  const hay = text.toLowerCase()
  if (!hay.trim()) return []
  const excluded = new Set([...excludeNames].map((n) => normalizeName(n)).filter(Boolean))
  const found: TripStop[] = []
  const seen = new Set<string>()

  const candidates: Array<{ stop: TripStop; name: string }> = []
  for (const day of trip.days) {
    for (const item of day.items) {
      if (!isStopItem(item)) continue
      const names = stopNames(item)
      if (names.some((name) => excluded.has(normalizeName(name)))) continue
      for (const name of names) {
        if (name.trim().length < minMatchLength(name)) continue
        candidates.push({ stop: { day, item }, name })
      }
    }
  }
  candidates.sort((a, b) => b.name.length - a.name.length)

  for (const { stop, name } of candidates) {
    const key = `${stop.day.id}:${stop.item.id}`
    if (seen.has(key)) continue
    if (!hay.includes(name.toLowerCase())) continue
    seen.add(key)
    found.push(stop)
    if (found.length >= 6) break
  }
  return found
}

export function stopToConciergePlace(stop: TripStop): ConciergePlace {
  const loc = stop.item.location
  const place: ConciergePlace = {
    name: loc?.name?.trim() || stop.item.title,
    dayId: stop.day.id,
    itemId: stop.item.id,
  }
  if (loc?.address) place.address = loc.address
  if (typeof loc?.lat === "number") place.lat = loc.lat
  if (typeof loc?.lng === "number") place.lng = loc.lng
  if (loc?.category) place.category = loc.category
  if (loc?.placeId) place.placeId = loc.placeId
  if (stop.item.notes) place.notes = stop.item.notes
  const maps = stop.item.links?.find((l) => isGoogleMapsUrl(l))
  if (maps) place.mapsUrl = maps
  return place
}

export interface ResolvedMove {
  key: string
  move: ConciergeMove
  stop: TripStop
  toDay?: TripDay
  label: string
}

export function resolveMove(trip: Trip, move: ConciergeMove): ResolvedMove | null {
  const stop = move.itemId
    ? trip.days
        .flatMap((day) => day.items.map((item) => ({ day, item })))
        .find((s) => isStopItem(s.item) && s.item.id === move.itemId) ??
      findTripStop(trip, move.name, move.dayId ?? move.fromDayId)
    : findTripStop(trip, move.name, move.dayId ?? move.fromDayId)
  if (!stop) return null

  const fromIndex = trip.days.findIndex((d) => d.id === stop.day.id)
  const fromLabel = dayLabel(stop.day, fromIndex)

  if (move.type === "remove") {
    return {
      key: `remove|${stop.item.id}`,
      move,
      stop,
      label: `Remove ${stop.item.title} from ${fromLabel}?`,
    }
  }

  if (move.type === "move") {
    const toDay = trip.days.find((d) => d.id === move.toDayId)
    if (!toDay || toDay.id === stop.day.id) return null
    const toIndex = trip.days.findIndex((d) => d.id === toDay.id)
    return {
      key: `move|${stop.item.id}|${toDay.id}`,
      move,
      stop,
      toDay,
      label: `Move ${stop.item.title} from ${fromLabel} to ${dayLabel(toDay, toIndex)}?`,
    }
  }

  if (move.type === "set_time" && move.time) {
    return {
      key: `set_time|${stop.item.id}|${move.time}`,
      move,
      stop,
      label: `Set ${stop.item.title} to ${move.time}?`,
    }
  }

  return null
}

export function resolveMoves(trip: Trip, moves: ConciergeMove[]): ResolvedMove[] {
  const out: ResolvedMove[] = []
  const seen = new Set<string>()
  for (const move of moves) {
    const resolved = resolveMove(trip, move)
    if (!resolved || seen.has(resolved.key)) continue
    seen.add(resolved.key)
    out.push(resolved)
  }
  return out
}
