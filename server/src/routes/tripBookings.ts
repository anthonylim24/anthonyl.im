import type { Context, Hono, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import { createRateLimit, userOrClientKey } from "../middleware/rateLimit"
import { MAX_PASTE_CHARS, type BookingParser } from "../trips/bookingParse"
import { todayIn } from "../trips/suggestDays"
import type { Trip, TripAccess } from "../trips/types"

// POST /api/trips/:id/bookings/parse — read the bookings out of a pasted
// confirmation. Nothing is written: the client shows what was found and adds
// only what the traveller ticks. Registered on the trips router, so the
// Clerk gate and the router's own rate limit run first.

type Loaded = { trip: Trip; access: TripAccess } | { error: Response }

export interface BookingRoutesDeps {
  /** Null when the server has no model key: the route answers 503. */
  parse: BookingParser | null
  /** The trip, with edit access required, or the response to send instead. */
  load: (c: Context) => Promise<Loaded>
  /** A paste is one model call of up to 20k characters: far fewer than the router's 60 a minute. */
  rateLimit?: MiddlewareHandler
  today?: (timezone: string) => string
}

const bodySchema = z.object({ text: z.string() })

const TOO_LONG = `That’s more than ${MAX_PASTE_CHARS.toLocaleString("en-US")} characters. Paste just the part with the booking.`

const today = (timezone: string) => todayIn(timezone, new Date())

export function registerBookingRoutes(trips: Hono, deps: BookingRoutesDeps): void {
  const limit = deps.rateLimit ?? createRateLimit({ windowMs: 10 * 60_000, max: 10, keyPrefix: "trips-booking-parse", key: userOrClientKey })
  // JSON escaping can spell one character in up to 12 bytes; anything past this is not a 20k-character paste.
  const sized = bodyLimit({
    maxSize: MAX_PASTE_CHARS * 12 + 1024,
    onError: (c) => c.json({ error: "too_long", message: TOO_LONG }, 413),
  })

  trips.post("/:id/bookings/parse", limit, sized, async (c) => {
    const loaded = await deps.load(c)
    if ("error" in loaded) return loaded.error
    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", message: "Paste the confirmation text." }, 400)
    const text = body.data.text
    if (text.length > MAX_PASTE_CHARS) return c.json({ error: "too_long", message: TOO_LONG }, 413)
    if (!text.trim()) return c.json({ error: "invalid request", message: "Paste the confirmation text." }, 400)
    if (!deps.parse) {
      return c.json({ error: "ai_not_configured", message: "Reading confirmations isn’t set up on this server. Add the booking by hand instead." }, 503)
    }
    const { trip } = loaded
    try {
      const bookings = await deps.parse({ text, trip, today: (deps.today ?? today)(trip.timezone) })
      return c.json({ bookings })
    } catch {
      // The parser has already logged which model failed, without the paste.
      return c.json({ error: "parse_failed", message: "Couldn’t read that confirmation just now. Try again in a moment." }, 502)
    }
  })
}
