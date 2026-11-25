import { Effect, Schema } from "effect"
import { HttpStatusError, TimeoutError } from "../../../effect/errors"
import { requestJson, sleep, type GetToken } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"
import type { PlacePhoto } from "../ideas/contract"
import { webUrl } from "../ideas/placeDetailsApi"
import type { AreaGeometry, Neighborhood } from "./contract"

// GET /api/trips/:id/neighborhoods and its outlines. The first grouping of a
// trip takes the model about half a minute, longer than a proxy holds a
// quiet request, so the server answers 202 while it works and this polls.

/** Grouping failed or cannot happen; `message` is the one line the tab shows. */
export class NeighborhoodsError extends Schema.TaggedError<NeighborhoodsError>()("NeighborhoodsError", {
  message: Schema.String,
  /** False when asking again cannot help (the server has no model). */
  retry: Schema.Boolean,
}) {}

const POLL_MS = 3_000
/** The server holds each request up to 20 s before answering 202. */
const REQUEST_MS = 45_000
/** The server gives the model 75 s, then a backup model its own while. */
const GIVE_UP_MS = 150_000

const OFFLINE = "Couldn’t reach the server. Check your connection and try again."
const FAILED = "Couldn’t group your stops into neighborhoods just now."
const TOO_SLOW = "Grouping your stops is taking too long. Try again in a moment."

export function neighborhoodsErrorMessage(status: number): NeighborhoodsError {
  if (status === 503) return new NeighborhoodsError({ message: "Neighborhoods aren’t available on this server.", retry: false })
  if (status === 429) return new NeighborhoodsError({ message: "That’s a lot of asking in a short while. Try again in a few minutes.", retry: true })
  if (status === 401) return new NeighborhoodsError({ message: "Your session ended. Sign in again to see your neighborhoods.", retry: true })
  if (status === 404) return new NeighborhoodsError({ message: "This trip isn’t available any more.", retry: false })
  return new NeighborhoodsError({ message: FAILED, retry: true })
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined

function cleanPhotos(value: unknown): PlacePhoto[] {
  const photos: PlacePhoto[] = []
  for (const item of Array.isArray(value) ? (value as unknown[]).slice(0, 3) : []) {
    const photo = item as Partial<PlacePhoto> | null
    const url = webUrl(photo?.url, true)
    const author = text(photo?.author?.name, 80)
    // Google's terms tie each photo to its credit: one without is not shown.
    if (!photo || !url || !author) continue
    const clean: PlacePhoto = { url, author: { name: author } }
    const uri = webUrl(photo.author?.uri)
    if (uri) clean.author!.uri = uri
    if (typeof photo.width === "number" && typeof photo.height === "number" && photo.width > 0 && photo.height > 0) {
      clean.width = photo.width
      clean.height = photo.height
    }
    photos.push(clean)
  }
  return photos
}

/** The server's areas, field by field; an area without a name, city or stop is dropped. */
export function cleanAreas(value: unknown): Neighborhood[] {
  const out: Neighborhood[] = []
  for (const item of Array.isArray(value) ? (value as unknown[]).slice(0, 12) : []) {
    if (!item || typeof item !== "object") continue
    const raw = item as Record<string, unknown>
    const id = text(raw.id, 40)
    const name = text(raw.name, 80)
    const city = text(raw.city, 60)
    const stopIds = Array.isArray(raw.stopIds) ? (raw.stopIds as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0) : []
    if (!id || !name || !city || stopIds.length === 0) continue
    const area: Neighborhood = { id, name, city, summary: text(raw.summary, 400) ?? "", stopIds, photos: cleanPhotos(raw.photos) }
    const localName = text(raw.localName, 80)
    if (localName && localName !== name) area.localName = localName
    out.push(area)
  }
  return out
}

const finitePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
const isRing = (value: unknown): value is [number, number][] => Array.isArray(value) && value.length >= 4 && value.every(finitePair)
const isPolygon = (value: unknown): value is [number, number][][] => Array.isArray(value) && value.length > 0 && value.every(isRing)

/** A GeoJSON polygon or multipolygon of finite points, or null. */
export function cleanGeometry(value: unknown): AreaGeometry | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { type?: unknown; coordinates?: unknown }
  if (raw.type === "Polygon" && isPolygon(raw.coordinates)) return { type: "Polygon", coordinates: raw.coordinates }
  if (raw.type === "MultiPolygon" && Array.isArray(raw.coordinates) && raw.coordinates.length > 0 && raw.coordinates.every(isPolygon)) {
    return { type: "MultiPolygon", coordinates: raw.coordinates as [number, number][][][] }
  }
  return null
}

/** Groupings by trip and stops: the same stops in the same places answer from here. */
const groupings = new Map<string, Neighborhood[]>()
/** Outlines by trip, stops and area, null included. Failures are never kept. */
const outlines = new Map<string, AreaGeometry | null>()
const KEPT = 40

function keep<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key)
  cache.set(key, value)
  for (const oldest of cache.keys()) {
    if (cache.size <= KEPT) break
    cache.delete(oldest)
  }
}

/** Forget every answer (tests). */
export function clearAreasCache() {
  groupings.clear()
  outlines.clear()
}

export const cachedNeighborhoods = (tripId: string, fingerprint: string) => groupings.get(`${tripId}|${fingerprint}`)

const toAreasError = (err: unknown): NeighborhoodsError =>
  err instanceof NeighborhoodsError
    ? err
    : err instanceof HttpStatusError
      ? neighborhoodsErrorMessage(err.status)
      : err instanceof TimeoutError
        ? new NeighborhoodsError({ message: TOO_SLOW, retry: true })
        : new NeighborhoodsError({ message: OFFLINE, retry: true })

const loadEffect = Effect.fn("TripsService.neighborhoods")(function* (getToken: GetToken, tripId: string, signal?: AbortSignal) {
  const started = Date.now()
  const path = `/api/trips/${encodeURIComponent(tripId)}/neighborhoods`
  for (;;) {
    const body = yield* requestJson<{ areas?: unknown; status?: unknown }>(getToken, path, { signal }, { timeoutMs: REQUEST_MS })
    if (Array.isArray(body.areas)) return cleanAreas(body.areas)
    if (body.status !== "grouping") return yield* Effect.fail(new NeighborhoodsError({ message: FAILED, retry: true }))
    if (Date.now() - started > GIVE_UP_MS) return yield* Effect.fail(new NeighborhoodsError({ message: TOO_SLOW, retry: true }))
    yield* sleep(POLL_MS, signal)
    if (signal?.aborted) return yield* Effect.fail(new NeighborhoodsError({ message: FAILED, retry: true }))
  }
})

/**
 * The trip's neighborhoods for its stops as they are (`fingerprint`, from
 * `areaFingerprint`). Rejects with `NeighborhoodsError`.
 */
export function loadNeighborhoods(getToken: GetToken, tripId: string, fingerprint: string, signal?: AbortSignal): Promise<Neighborhood[]> {
  const known = cachedNeighborhoods(tripId, fingerprint)
  if (known) return Promise.resolve(known)
  return runPromise(
    loadEffect(getToken, tripId, signal).pipe(
      Effect.mapError(toAreasError),
      Effect.tap((areas) => Effect.sync(() => !signal?.aborted && keep(groupings, `${tripId}|${fingerprint}`, areas))),
    ),
  )
}

const outlineEffect = Effect.fn("TripsService.areaOutline")(function* (getToken: GetToken, tripId: string, areaId: string, signal?: AbortSignal) {
  const body = yield* requestJson<{ outline?: unknown }>(
    getToken,
    `/api/trips/${encodeURIComponent(tripId)}/neighborhoods/${encodeURIComponent(areaId)}/outline`,
    { signal },
    { timeoutMs: REQUEST_MS },
  )
  return cleanGeometry(body.outline)
})

/**
 * OpenStreetMap's boundary for one area, or null: none worth drawing, or it
 * could not be looked up just now (then it is asked again next time). Never
 * rejects; the map keeps the shape drawn around the stops.
 */
export function loadAreaOutline(getToken: GetToken, tripId: string, fingerprint: string, areaId: string, signal?: AbortSignal): Promise<AreaGeometry | null> {
  const key = `${tripId}|${fingerprint}|${areaId}`
  if (outlines.has(key)) return Promise.resolve(outlines.get(key)!)
  return runPromise(
    outlineEffect(getToken, tripId, areaId, signal).pipe(
      Effect.tap((outline) => Effect.sync(() => !signal?.aborted && keep(outlines, key, outline))),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  )
}
