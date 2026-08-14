/** Parse Gemini grounding metadata + the concierge `:::add-places` trailer.
 *
 *  Chat streams hide the trailer from the traveler and emit a structured
 *  `{ places }` SSE event the UI can turn into Add-to-itinerary cards. */

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

export interface GeminiGroundingChunk {
  kind: "maps" | "web"
  title: string
  uri: string
  placeId?: string
}

export interface GeminiGrounding {
  chunks: GeminiGroundingChunk[]
  webSearchQueries: string[]
}

export type PlaceGeocoder = (
  query: string,
) => Promise<{ lat: number; lng: number; address?: string; placeId?: string } | null>

export function placeKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Maps grounding titles are often "Venue - Google Maps" or "Review of Venue". */
export function venueNameFromMapsTitle(title: string): string | null {
  let name = title.trim().replace(/\s+[—–-]\s+Google Maps\s*$/i, "").trim()
  if (!name || /^google maps$/i.test(name)) return null
  if (/^reviews?\s+of\b/i.test(name)) return null
  return clip(name, 200) ?? null
}

function venueMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function keysOverlap(a: string, b: string): boolean {
  return venueMatchKey(a) === venueMatchKey(b)
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

export function normalizePlaceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const id = trimmed.startsWith("places/") ? trimmed.slice("places/".length) : trimmed
  return /^[A-Za-z0-9_-]{8,256}$/.test(id) ? id : undefined
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

export function asConciergePlace(raw: unknown): ConciergePlace | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const name = clip(obj.name, 200)
  if (!name) return null
  const categoryRaw = typeof obj.category === "string" ? obj.category.trim().toLowerCase() : ""
  const place: ConciergePlace = { name }
  const address = clip(obj.address, 400)
  if (address) place.address = address
  const lat = finiteCoord(obj.lat, -90, 90)
  const lng = finiteCoord(obj.lng, -180, 180)
  if (lat != null) place.lat = lat
  if (lng != null) place.lng = lng
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

export function parseAddPlacesTrailer(hidden: string): ConciergePlace[] {
  const text = hidden.trim()
  if (!text) return []
  const stripped = text.replace(/^:::add-places\b/, "").replace(/:::\s*$/, "").trim()
  const start = stripped.indexOf("[")
  const end = stripped.lastIndexOf("]")
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(asConciergePlace).filter((p): p is ConciergePlace => p !== null).slice(0, 8)
}

function definedFields(place: ConciergePlace): ConciergePlace {
  const out: ConciergePlace = { name: place.name }
  if (place.address) out.address = place.address
  if (place.lat != null) out.lat = place.lat
  if (place.lng != null) out.lng = place.lng
  if (place.category) out.category = place.category
  if (place.dayId) out.dayId = place.dayId
  if (place.notes) out.notes = place.notes
  if (place.placeId) out.placeId = place.placeId
  if (place.mapsUrl) out.mapsUrl = place.mapsUrl
  return out
}

export function placesFromMapsChunks(grounding: GeminiGrounding | undefined): ConciergePlace[] {
  if (!grounding) return []
  const out: ConciergePlace[] = []
  const seen = new Set<string>()
  for (const chunk of grounding.chunks) {
    if (chunk.kind !== "maps") continue
    const name = venueNameFromMapsTitle(chunk.title)
    if (!name) continue
    const key = placeKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    const place: ConciergePlace = { name }
    const mapsUrl = safeHttpUrl(chunk.uri)
    if (mapsUrl) place.mapsUrl = mapsUrl
    if (chunk.placeId) place.placeId = chunk.placeId
    out.push(place)
  }
  return out
}

export function mergeConciergePlaces(fromTrailer: ConciergePlace[], fromMaps: ConciergePlace[]): ConciergePlace[] {
  const byKey = new Map<string, ConciergePlace>()
  for (const place of fromTrailer) byKey.set(placeKey(place.name), definedFields(place))
  for (const place of fromMaps) {
    const key = placeKey(place.name)
    const matchKey = [...byKey.keys()].find((k) => keysOverlap(k, key))
    if (matchKey) {
      const prev = byKey.get(matchKey)!
      byKey.set(matchKey, { ...definedFields(place), ...prev, name: prev.name })
      continue
    }
    if (fromTrailer.length === 0) byKey.set(key, definedFields(place))
  }
  return [...byKey.values()].slice(0, 8)
}

export function dropPlacesAlreadyOnTrip(
  places: ConciergePlace[],
  titles: Iterable<string>,
): ConciergePlace[] {
  const existing = new Set<string>()
  for (const title of titles) {
    const key = placeKey(title)
    if (key) existing.add(key)
  }
  return places.filter((p) => !existing.has(placeKey(p.name)))
}

export function tripPlaceTitles(days: Array<{ items: Array<{ title?: string; location?: { name?: string } }> }>): string[] {
  const titles: string[] = []
  for (const day of days) {
    for (const item of day.items) {
      if (item.title) titles.push(item.title)
      if (item.location?.name) titles.push(item.location.name)
    }
  }
  return titles
}

export function sourcesFromGrounding(grounding: GeminiGrounding | undefined): ConciergeSource[] {
  if (!grounding?.chunks.length) return []
  const out: ConciergeSource[] = []
  const seen = new Set<string>()
  for (const chunk of grounding.chunks) {
    const uri = safeHttpUrl(chunk.uri)
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    out.push({
      kind: chunk.kind,
      title: clip(chunk.title, 160) || (chunk.kind === "maps" ? "Google Maps" : "Source"),
      uri,
    })
  }
  return out.slice(0, 8)
}

const GEOCODE_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

export async function enrichPlacesWithGeocode(
  places: ConciergePlace[],
  geocode: PlaceGeocoder,
  timeoutMs = GEOCODE_TIMEOUT_MS,
): Promise<ConciergePlace[]> {
  return Promise.all(
    places.map(async (place) => {
      if (typeof place.lat === "number" && typeof place.lng === "number") return place
      const query = [place.name, place.address].filter(Boolean).join(", ")
      if (!query) return place
      const geo = await withTimeout(geocode(query), timeoutMs)
      if (!geo) return place
      return {
        ...place,
        lat: geo.lat,
        lng: geo.lng,
        address: place.address ?? geo.address,
        placeId: place.placeId ?? geo.placeId,
      }
    }),
  )
}

export function placeCanBeAdded(place: ConciergePlace): boolean {
  return Boolean(place.address || (place.lat != null && place.lng != null))
}

/** Hold back the `:::add-places` trailer so it never reaches the chat bubble. */
export function createAddPlacesFenceFilter(): {
  push: (delta: string) => string
  end: () => { visibleTail: string; hidden: string }
} {
  let pending = ""
  let hidden = ""
  let hiding = false

  const push = (delta: string): string => {
    if (hiding) {
      hidden += delta
      return ""
    }
    const buf = pending + delta
    const idx = buf.indexOf(":::")
    if (idx === -1) {
      const tail = buf.endsWith("::") ? 2 : buf.endsWith(":") ? 1 : 0
      const emit = buf.slice(0, buf.length - tail)
      pending = buf.slice(buf.length - tail)
      return emit
    }
    const rest = buf.slice(idx)
    if (ADD_PLACES_FENCE.startsWith(rest) && rest.length < ADD_PLACES_FENCE.length) {
      pending = buf
      return ""
    }
    if (rest.startsWith(ADD_PLACES_FENCE)) {
      hiding = true
      hidden = rest
      pending = ""
      const cut = idx > 0 && buf[idx - 1] === "\n" ? idx - 1 : idx
      return buf.slice(0, cut)
    }
    pending = ""
    return `${buf.slice(0, idx + 3)}${push(buf.slice(idx + 3))}`
  }

  const end = (): { visibleTail: string; hidden: string } => {
    if (hiding) return { visibleTail: "", hidden }
    const visibleTail = pending
    pending = ""
    return { visibleTail, hidden: "" }
  }

  return { push, end }
}
