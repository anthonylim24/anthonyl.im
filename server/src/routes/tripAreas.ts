import type { Context, Hono, MiddlewareHandler } from "hono"
import { consumeRateLimit, createRateLimit, rateLimitsOff, userOrClientKey } from "../middleware/rateLimit"
import { GroupingLimitError, UnknownAreaError, type NeighborhoodService } from "../trips/neighborhoods"
import type { Trip, TripAccess } from "../trips/types"

// Grouping a long trip takes the model up to a minute, longer than a proxy
// keeps a quiet request open, so a grouping not ready in `waitMs` answers 202
// and the client asks again; the work carries on and is cached. Registered on
// the trips router, so the Clerk gate and the router's own rate limit run first.

type Loaded = { trip: Trip; access: TripAccess } | { error: Response }

export interface AreaRoutesDeps {
  /** Null when the server has no model key: the list answers 503. */
  areas: NeighborhoodService | null
  /** The trip, with view access, or the response to send instead. */
  load: (c: Context) => Promise<Loaded>
  /** How long a request waits on a grouping before answering 202. */
  waitMs?: number
  rateLimit?: MiddlewareHandler
  outlineRateLimit?: MiddlewareHandler
  /** Whether this caller may start one more model call now; counted only when a grouping needs the model. */
  mayStartGrouping?: (c: Context) => boolean
  /** How long an outline may take in all, queue included. */
  outlineMs?: number
}

const AREA_ID = /^a-[A-Za-z0-9_-]{10}$/
/** Well inside a reverse proxy's 60 s idle timeout, with room for photos. */
const WAIT_MS = 20_000
/** Each outline is up to four Nominatim searches at one a second for the whole server; past this the map keeps its drawn shape. */
const OUTLINE_MS = 8_000
/**
 * Model calls one person may start in ten minutes. A grouping is one or two
 * calls of up to 75 s and a dozen Places searches; an edit that keeps every
 * stop inside its area costs none, so this is spent only on new parts of town.
 */
const GROUPINGS_PER_WINDOW = 10
const GROUPING_WINDOW_MS = 10 * 60_000

export function registerAreaRoutes(trips: Hono, deps: AreaRoutesDeps): void {
  // A poll every few seconds while a grouping runs, and one per open of the tab.
  const limit = deps.rateLimit ?? createRateLimit({ windowMs: 10 * 60_000, max: 120, keyPrefix: "trips-areas", key: userOrClientKey })
  // Each outline can mean up to four Nominatim searches, which the whole server shares at one a second.
  const outlineLimit =
    deps.outlineRateLimit ?? createRateLimit({ windowMs: 10 * 60_000, max: 40, keyPrefix: "trips-area-outline", key: userOrClientKey })
  const mayStart =
    deps.mayStartGrouping ??
    ((c: Context) => rateLimitsOff() || consumeRateLimit(`trips-area-groupings:${userOrClientKey(c)}`, { windowMs: GROUPING_WINDOW_MS, max: GROUPINGS_PER_WINDOW }).ok)

  trips.get("/:id/neighborhoods", limit, async (c) => {
    const loaded = await deps.load(c)
    if ("error" in loaded) return loaded.error
    if (!deps.areas) {
      return c.json({ error: "ai_not_configured", message: "Neighborhoods aren’t set up on this server." }, 503)
    }
    try {
      const answer = await deps.areas.list(loaded.trip, { waitMs: deps.waitMs ?? WAIT_MS, mayStart: () => mayStart(c) })
      if ("pending" in answer) return c.json({ status: "grouping" }, 202)
      return c.json({ areas: answer.areas })
    } catch (err) {
      if (err instanceof GroupingLimitError) {
        return c.json({ error: "rate_limited", message: "Too many new groupings in a short while. Try again in a few minutes." }, 429)
      }
      // The service has logged which model failed, without trip text.
      return c.json({ error: "neighborhoods_failed", message: "Couldn’t group your stops into neighborhoods just now." }, 502)
    }
  })

  trips.get("/:id/neighborhoods/:areaId/outline", outlineLimit, async (c) => {
    const loaded = await deps.load(c)
    if ("error" in loaded) return loaded.error
    const areaId = c.req.param("areaId")
    if (!AREA_ID.test(areaId)) return c.json({ error: "invalid request", message: "That isn’t one of this trip’s neighborhoods." }, 400)
    if (!deps.areas) return c.json({ outline: null })
    try {
      return c.json({ outline: await deps.areas.outline(loaded.trip, areaId, AbortSignal.timeout(deps.outlineMs ?? OUTLINE_MS)) })
    } catch (err) {
      // Not "no outline": the client must not keep a null for an area this server has only forgotten.
      if (err instanceof UnknownAreaError) return c.json({ error: "area_unknown", message: "This neighborhood needs grouping again." }, 409)
      console.warn(`[trips/neighborhoods] outline lookup failed (${err instanceof Error ? err.message : "error"})`)
      return c.json({ error: "outline_unavailable", message: "Couldn’t look up this neighborhood’s outline just now." }, 503)
    }
  })
}
