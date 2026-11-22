import { Hono, type MiddlewareHandler } from "hono"
import type { LatLng } from "../trips/conciergeTools"
import type { PlaceTypeahead } from "../trips/placeSearch"

// ── /api/places router ───────────────────────────────────────────────────
//
// GET /search?q=…&lat=…&lng=… — type-ahead suggestions for the planner's
// place fields. Signed-in users only (it spends the Maps key). It has its
// own rate limit: a search runs per pause in typing, and sharing the trips
// bucket would let a long search starve saves.

export interface PlaceSearchRouterDeps {
  /** Resolves the Authorization header to a userId, or null. */
  verifyAuth: (authHeader: string | undefined) => Promise<string | null>
  /** Null when the server has no Maps key: the client keeps its OpenStreetMap results. */
  search: PlaceTypeahead | null
  /** Runs after the auth gate, so it can key on the signed-in user. */
  rateLimit?: MiddlewareHandler
}

export const MAX_QUERY = 120

/** `lat` / `lng` as a bias point: both or neither, and on the globe. */
export function parseNear(lat: string | undefined, lng: string | undefined): LatLng | null | "invalid" {
  if (lat === undefined && lng === undefined) return null
  if (lat === undefined || lng === undefined || lat.trim() === "" || lng.trim() === "") return "invalid"
  const point = { lat: Number(lat), lng: Number(lng) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return "invalid"
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return "invalid"
  return point
}

export function createPlaceSearchRouter(deps: PlaceSearchRouterDeps) {
  const places = new Hono()

  places.use("*", async (c, next) => {
    const userId = await deps.verifyAuth(c.req.header("Authorization"))
    if (!userId) return c.json({ error: "unauthorized" }, 401)
    c.set("userId" as never, userId as never)
    await next()
  })
  if (deps.rateLimit) places.use("*", deps.rateLimit)

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

  return places
}
