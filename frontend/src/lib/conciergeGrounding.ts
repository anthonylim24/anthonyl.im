/** Shared concierge grounding payloads (Search / Maps sources + addable places). */

export const ADD_PLACES_FENCE = ":::add-places"
export const TRIP_MOVES_FENCE = ":::trip-moves"

export type ConciergeMoveType = "remove" | "move" | "set_time"

export interface ConciergeMove {
  type: ConciergeMoveType
  name: string
  dayId?: string
  fromDayId?: string
  toDayId?: string
  itemId?: string
  time?: string
}

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
  "palace",
  "shrine",
  "viewpoint",
  "experience",
  "neighborhood",
  "venue",
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
  itemId?: string
  /** Stable handle the concierge uses to point back at this card. */
  ref?: string
  /** Suggested start time on `dayId`, 24h. */
  time?: string
  rating?: number
  ratingCount?: number
  /** "€" … "€€€€". */
  price?: string
  /** Opening hours on `hoursDay`, e.g. "09:00–18:00" or "Closed". */
  hours?: string
  hoursDay?: string
  /** Open at the suggested day and time. */
  open?: boolean
  /** Walk estimate from a planned stop. */
  walk?: { from: string; minutes: number; meters: number }
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
  const itemId = clip(obj.itemId, 64)
  if (itemId) place.itemId = itemId
  const ref = clip(obj.ref, 300)
  if (ref) place.ref = ref
  const time = asClock(obj.time)
  if (time) place.time = time
  if (typeof obj.rating === "number" && obj.rating >= 0 && obj.rating <= 5) place.rating = obj.rating
  if (typeof obj.ratingCount === "number" && obj.ratingCount >= 0) place.ratingCount = obj.ratingCount
  const price = clip(obj.price, 8)
  if (price) place.price = price
  const hours = clip(obj.hours, 80)
  if (hours) place.hours = hours
  const hoursDay = clip(obj.hoursDay, 12)
  if (hoursDay) place.hoursDay = hoursDay
  if (typeof obj.open === "boolean") place.open = obj.open
  if (obj.walk && typeof obj.walk === "object") {
    const walk = obj.walk as Record<string, unknown>
    const from = clip(walk.from, 120)
    if (from && typeof walk.minutes === "number" && typeof walk.meters === "number") {
      place.walk = { from, minutes: walk.minutes, meters: walk.meters }
    }
  }
  return place
}

function asClock(value: unknown): string | undefined {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : undefined
}

// ── Proposed changes ─────────────────────────────────────────────────────
//
// The concierge never edits a trip. It sends a validated batch; the traveller
// applies it (and can undo it) from the card.

export type ProposalChange =
  | { id: string; op: "add"; dayId: string; time?: string; endTime?: string; notes?: string; place: ConciergePlace }
  | { id: string; op: "set_time"; dayId: string; itemId: string; title: string; from?: string; time: string; endTime?: string }
  | { id: string; op: "move"; itemId: string; title: string; fromDayId: string; toDayId: string; time?: string }
  | { id: string; op: "remove"; dayId: string; itemId: string; title: string }
  | { id: string; op: "reorder"; dayId: string; order: string[]; titles: string[] }

export interface ConciergeProposal {
  id: string
  summary: string
  changes: ProposalChange[]
}

export function asProposalChange(raw: unknown): ProposalChange | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const id = clip(obj.id, 40)
  if (!id) return null
  const dayId = clip(obj.dayId, 64)
  const itemId = clip(obj.itemId, 64)
  const title = clip(obj.title, 300)
  const time = asClock(obj.time)
  const endTime = asClock(obj.endTime)
  switch (obj.op) {
    case "add": {
      const place = asConciergePlace(obj.place)
      if (!place || !dayId) return null
      const notes = clip(obj.notes, 400)
      return { id, op: "add", dayId, ...(time ? { time } : {}), ...(endTime ? { endTime } : {}), ...(notes ? { notes } : {}), place }
    }
    case "set_time": {
      if (!dayId || !itemId || !title || !time) return null
      const from = asClock(obj.from)
      return { id, op: "set_time", dayId, itemId, title, ...(from ? { from } : {}), time, ...(endTime ? { endTime } : {}) }
    }
    case "move": {
      const fromDayId = clip(obj.fromDayId, 64)
      const toDayId = clip(obj.toDayId, 64)
      if (!itemId || !title || !fromDayId || !toDayId) return null
      return { id, op: "move", itemId, title, fromDayId, toDayId, ...(time ? { time } : {}) }
    }
    case "remove":
      return dayId && itemId && title ? { id, op: "remove", dayId, itemId, title } : null
    case "reorder": {
      const strings = (value: unknown) =>
        Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 200) : []
      const order = strings(obj.order)
      return dayId && order.length ? { id, op: "reorder", dayId, order, titles: strings(obj.titles) } : null
    }
    default:
      return null
  }
}

export function asConciergeProposal(raw: unknown): ConciergeProposal | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const id = clip(obj.id, 64)
  if (!id || !Array.isArray(obj.changes)) return null
  const changes = obj.changes.map(asProposalChange).filter((c): c is ProposalChange => c !== null).slice(0, 16)
  if (changes.length === 0) return null
  return { id, summary: clip(obj.summary, 160) ?? "Update the itinerary", changes }
}

/** What the concierge is doing right now, from real tool activity. */
export interface ConciergeStatus {
  kind: "search" | "places" | "directions" | "proposal" | "writing" | "done"
  label?: string
  detail?: string
}

export function asConciergeStatus(raw: unknown): ConciergeStatus | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const kinds = ["search", "places", "directions", "proposal", "writing", "done"] as const
  const kind = kinds.find((k) => k === obj.kind)
  if (!kind) return null
  const label = clip(obj.label, 80)
  const detail = clip(obj.detail, 140)
  return { kind, ...(label ? { label } : {}), ...(detail ? { detail } : {}) }
}

/** Which model answered and which tools it had. */
export interface ConciergeMeta {
  model: string
  tools: string[]
}

export function asConciergeMeta(raw: unknown): ConciergeMeta | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const model = clip(obj.model, 80)
  if (!model) return null
  return { model, tools: Array.isArray(obj.tools) ? obj.tools.filter((t): t is string => typeof t === "string").slice(0, 8) : [] }
}

export function asFollowups(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 80)
    .slice(0, 3)
}

const MOVE_TYPES = new Set<ConciergeMoveType>(["remove", "move", "set_time"])
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

export function asConciergeMove(raw: unknown): ConciergeMove | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const type = typeof obj.type === "string" ? obj.type.trim() : ""
  if (!MOVE_TYPES.has(type as ConciergeMoveType)) return null
  const name = clip(obj.name, 200)
  if (!name) return null
  const move: ConciergeMove = { type: type as ConciergeMoveType, name }
  const dayId = clip(obj.dayId, 64)
  if (dayId) move.dayId = dayId
  const fromDayId = clip(obj.fromDayId, 64)
  if (fromDayId) move.fromDayId = fromDayId
  const toDayId = clip(obj.toDayId, 64)
  if (toDayId) move.toDayId = toDayId
  const itemId = clip(obj.itemId, 64)
  if (itemId) move.itemId = itemId
  const time = typeof obj.time === "string" ? obj.time.trim() : ""
  if (time && TIME_RE.test(time)) move.time = time
  if (move.type === "move" && !move.toDayId) return null
  if (move.type === "set_time" && !move.time) return null
  return move
}

export function asConciergeMoves(raw: unknown): ConciergeMove[] {
  if (!Array.isArray(raw)) return []
  return raw.map(asConciergeMove).filter((m): m is ConciergeMove => m !== null).slice(0, 8)
}

export function conciergeMoveKey(move: ConciergeMove): string {
  return [move.type, move.name.trim().toLowerCase(), move.dayId ?? "", move.toDayId ?? "", move.time ?? ""].join("|")
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

/** Hide a streaming or complete concierge fence trailer from the bubble. */
export function visibleConciergeText(text: string): string {
  const idx = text.search(/(?:^|\n)\s*:::(?:add-places|trip-moves)\b/)
  if (idx >= 0) return text.slice(0, idx).trimEnd()
  const partial = text.lastIndexOf(":::")
  if (partial >= 0) {
    const tail = text.slice(partial)
    if (
      (ADD_PLACES_FENCE.startsWith(tail) && tail.length < ADD_PLACES_FENCE.length) ||
      (TRIP_MOVES_FENCE.startsWith(tail) && tail.length < TRIP_MOVES_FENCE.length)
    ) {
      return text.slice(0, partial).trimEnd()
    }
  }
  return text
}

export function placeCanBeAdded(place: ConciergePlace): boolean {
  return Boolean(place.address || (place.lat != null && place.lng != null))
}

export function conciergePlaceKey(place: ConciergePlace): string {
  return `${place.name.trim().toLowerCase()}|${place.ref ?? place.placeId ?? place.address ?? ""}`
}
