import type { Context, Hono, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { createRateLimit, userOrClientKey } from "../middleware/rateLimit"
import { suggestDaysRequestSchema, type DaySuggester } from "../trips/suggestDays"
import type { Trip, TripAccess } from "../trips/types"

// POST /api/trips/:id/ideas/suggest-days — the days a wishlist idea fits
// best, for the "Add to day" picker. The idea travels in the body, so one
// saved a moment ago (not yet autosaved) still works. Nothing is written.
// Registered on the trips router, so the Clerk gate and the router's own
// rate limit run first. The suggester never fails: without a key, or when
// the model is slow or wrong, it answers the distance ranking.

type Loaded = { trip: Trip; access: TripAccess } | { error: Response }

export interface IdeaRoutesDeps {
  suggest: DaySuggester
  /** The trip, with edit access required, or the response to send instead. */
  load: (c: Context) => Promise<Loaded>
  /** One short model call per open picker: well under the router's 60 a minute. */
  rateLimit?: MiddlewareHandler
}

/** An idea is a title, a note and a place: generous for that, far short of a trip. */
const MAX_BODY_BYTES = 32 * 1024

export function registerIdeaRoutes(trips: Hono, deps: IdeaRoutesDeps): void {
  const limit = deps.rateLimit ?? createRateLimit({ windowMs: 10 * 60_000, max: 30, keyPrefix: "trips-suggest-days", key: userOrClientKey })
  const sized = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_long", message: "That idea is too long to place." }, 413) })

  trips.post("/:id/ideas/suggest-days", limit, sized, async (c) => {
    const loaded = await deps.load(c)
    if ("error" in loaded) return loaded.error
    const body = suggestDaysRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", message: "Send the idea to place." }, 400)
    return c.json(await deps.suggest({ trip: loaded.trip, idea: body.data.idea, signal: c.req.raw.signal }))
  })
}
