import { Hono, type MiddlewareHandler } from "hono"
import type { LatLng } from "../trips/conciergeTools"
import { PLACE_ID, PlaceDetailsUpstreamError, type PlaceDetailsLookup, type PlaceDetailsQuery } from "../trips/placeDetails"
import type { PlaceTypeahead } from "../trips/placeSearch"

// ── /api/places router ───────────────────────────────────────────────────
//
// GET /search?q=…&lat=…&lng=… — type-ahead suggestions for the planner's
// place fields. Signed-in users only (it spends the Maps key). It has its
// own rate limit: a search runs per pause in typing, and sharing the trips
// bucket would let a long search starve saves.
//
// GET /details?placeId=… (or ?name=…&lat=…&lng=…) — photos, summary, rating,
// hours and links for the wishlist's details popover. A tighter bucket of its
// own: each answer bills Place Details at its top tier plus up to six photos.

export interface PlaceSearchRouterDeps {
  /** Resolves the Authorization header to a userId, or null. */
  verifyAuth: (authHeader: string | undefined) => Promise<string | null>
  /** Null when the server has no Maps key: the client keeps its OpenStreetMap results. */
  search: PlaceTypeahead | null
  /** Runs after the auth gate, so it can key on the signed-in user. Applies to /search only. */
  rateLimit?: MiddlewareHandler
  /** Null (or absent) when the server has no Maps key: the client falls back to Wikipedia or the idea's own notes. */
  details?: PlaceDetailsLookup | null
  /** /details' own bucket, after the auth gate. */
  detailsRateLimit?: MiddlewareHandler
}

export const MAX_QUERY = 120
/** The longest place name /details will look up. */
export const MAX_NAME = 200

/** `lat` / `lng` as a bias point: both or neither, and on the globe. */
export function parseNear(lat: string | undefined, lng: string | undefined): LatLng | null | "invalid" {
  if (lat === undefined && lng === undefined) return null
  if (lat === undefined || lng === undefined || lat.trim() === "" || lng.trim() === "") return "invalid"
  const point = { lat: Number(lat), lng: Number(lng) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return "invalid"
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return "invalid"
  return point
}

/** A place id, else a name with the point it is at; a string says what is wrong with the request. */
export function parseDetailsQuery(
  placeId: string | undefined,
  name: string | undefined,
  lat: string | undefined,
  lng: string | undefined,
): PlaceDetailsQuery | string {
  const id = placeId?.trim()
  if (id) return PLACE_ID.test(id) ? { placeId: id } : "placeId is not a Google place id"
  const tidy = (name ?? "").replace(/\s+/g, " ").trim()
  if (tidy.length < 2 || tidy.length > MAX_NAME) return `name must be 2–${MAX_NAME} characters, or send a placeId`
  const near = parseNear(lat, lng)
  if (near === null || near === "invalid") return "lat and lng must be a point on the globe"
  return { name: tidy, near }
}

export function createPlaceSearchRouter(deps: PlaceSearchRouterDeps) {
  const places = new Hono()

  places.use("*", async (c, next) => {
    const userId = await deps.verifyAuth(c.req.header("Authorization"))
    if (!userId) return c.json({ error: "unauthorized" }, 401)
    c.set("userId" as never, userId as never)
    await next()
  })
  if (deps.rateLimit) places.use("/search", deps.rateLimit)
  if (deps.detailsRateLimit) places.use("/details", deps.detailsRateLimit)

  places.get("/search", async (c) => {
    const query = (c.req.query("q") ?? "").replace(/\s+/g, " ").trim()
    if (query.length < 2 || query.length > MAX_QUERY) return c.json({ error: `q must be 2–${MAX_QUERY} characters` }, 400)
    const near = parseNear(c.req.query("lat"), c.req.query("lng"))
    if (near === "invalid") return c.json({ error: "lat and lng must be a point on the globe" }, 400)
    if (!deps.search) return c.json({ error: "place search unavailable" }, 503)
    try {
      return c.json({ places: await deps.search({ query, near, signal: c.req.raw.signal }) })
    } catch (err) {
      console.warn("[places] search failed:", err instanceof Error ? err.message : err)
      return c.json({ error: "place search failed" }, 502)
    }
  })

  places.get("/details", async (c) => {
    const query = parseDetailsQuery(c.req.query("placeId"), c.req.query("name"), c.req.query("lat"), c.req.query("lng"))
    if (typeof query === "string") return c.json({ error: query }, 400)
    if (!deps.details) return c.json({ error: "place details unavailable" }, 503)
    try {
      return c.json({ place: await deps.details(query, c.req.raw.signal) })
    } catch (err) {
      // The status alone: an error from fetch can quote the URL it was sent to.
      const reason = err instanceof PlaceDetailsUpstreamError ? `upstream ${err.status}` : err instanceof Error ? err.name : "unknown"
      console.warn("[places] details failed:", reason)
      return c.json({ error: "place details failed" }, 502)
    }
  })

  return places
}
