/** Shared concierge grounding payloads (Search / Maps sources + addable places). */

export const ADD_PLACES_FENCE = ":::add-places"

const PLACE_CATEGORIES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "shopping",
  "activity",
  "hotel",
  "landmark",
  "other",
  "market",
  "museum",
  "park",
  "transit",
])

export interface ConciergePlace {
  name: string
  address?: string
  lat?: number
  lng?: number
  category?: string
  dayId?: string
  notes?: string
  placeId?: string
  mapsUrl?: string
}

export interface ConciergeSource {
  kind: "maps" | "web"
  title: string
  uri: string
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

function finiteCoord(value: unknown, min: number, max: number): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return n
}

export function normalizePlaceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const id = trimmed.startsWith("places/") ? trimmed.slice("places/".length) : trimmed
  return /^[A-Za-z0-9_-]{8,256}$/.test(id) ? id : undefined
}

export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function asConciergePlace(raw: unknown): ConciergePlace | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const name = clip(obj.name, 200)
  if (!name) return null
  const place: ConciergePlace = { name }
  const address = clip(obj.address, 400)
  if (address) place.address = address
  const lat = finiteCoord(obj.lat, -90, 90)
  const lng = finiteCoord(obj.lng, -180, 180)
  if (lat != null) place.lat = lat
  if (lng != null) place.lng = lng
  const categoryRaw = typeof obj.category === "string" ? obj.category.trim().toLowerCase() : ""
  if (categoryRaw && PLACE_CATEGORIES.has(categoryRaw)) place.category = categoryRaw
  const dayId = clip(obj.dayId, 64)
  if (dayId) place.dayId = dayId
  const notes = clip(obj.notes, 400)
  if (notes) place.notes = notes
  const placeId = normalizePlaceId(obj.placeId)
  if (placeId) place.placeId = placeId
  const mapsUrl = safeHttpUrl(obj.mapsUrl ?? obj.uri)
  if (mapsUrl) place.mapsUrl = mapsUrl
  return place
}

export function asConciergePlaces(raw: unknown): ConciergePlace[] {
  if (!Array.isArray(raw)) return []
  return raw.map(asConciergePlace).filter((p): p is ConciergePlace => p !== null).slice(0, 8)
}

export function asConciergeSources(raw: unknown): ConciergeSource[] {
  if (!Array.isArray(raw)) return []
  const out: ConciergeSource[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const uri = safeHttpUrl(obj.uri)
    if (!uri) continue
    const kind = obj.kind === "maps" || obj.kind === "web" ? obj.kind : "web"
    out.push({
      kind,
      title: clip(obj.title, 160) || (kind === "maps" ? "Google Maps" : "Source"),
      uri,
    })
  }
  return out.slice(0, 8)
}

/** Hide a streaming or complete `:::add-places` trailer from the bubble. */
export function visibleConciergeText(text: string): string {
  const idx = text.search(/(?:^|\n)\s*:::add-places\b/)
  if (idx >= 0) return text.slice(0, idx).trimEnd()
  const partial = text.lastIndexOf(":::")
  if (partial >= 0) {
    const tail = text.slice(partial)
    if (ADD_PLACES_FENCE.startsWith(tail) && tail.length < ADD_PLACES_FENCE.length) {
      return text.slice(0, partial).trimEnd()
    }
  }
  return text
}

export function placeCanBeAdded(place: ConciergePlace): boolean {
  return Boolean(place.address || (place.lat != null && place.lng != null))
}

export function conciergePlaceKey(place: ConciergePlace): string {
  return `${place.name.trim().toLowerCase()}|${place.placeId ?? place.address ?? ""}`
}
