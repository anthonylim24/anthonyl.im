import { Hono, type Context, type MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { categoryColor, categoryIcon, formatDistance, haversineMeters, type PlaceCategory } from "../data/koreaPlaces"
import { applySuggestions, generateItinerary, type AppliedSuggestions, type Geocoder, type LlmCall, type WeatherFetcher } from "../trips/ai"
import { streamTripChat } from "../trips/chat"
import { createBookingParserFromKeys, type BookingParser } from "../trips/bookingParse"
import { config } from "../config"
import { registerBookingRoutes } from "./tripBookings"
import { registerIdeaRoutes } from "./tripIdeas"
import { createDaySuggesterFromKeys, type DaySuggester } from "../trips/suggestDays"
import { collectCatalogPlaces, groupCatalogPlaces } from "../trips/placeCatalog"
import { buildKoreaTrip, KOREA_TRIP_ID } from "../trips/koreaTrip"
import { createTripReviewWorker, type ReviewWorker } from "../trips/reviewWorker"
import { isNotProvisionedError, type TripStore } from "../trips/store"
import { mutateTrip, nextUpdatedAt, PERSIST_RETRIES } from "../trips/tripWrites"
import {
  accessFor,
  applySuggestionsSchema,
  canEdit,
  canView,
  createInviteSchema,
  createTripSchema,
  enhanceRequestSchema,
  generateRequestSchema,
  joinTripSchema,
  tripChatRequestSchema,
  newId,
  nowIso,
  emptyDays,
  RESERVED_SLUGS,
  REVIEW_MAX_ATTEMPTS,
  settleStaleRun,
  defaultTripSlug,
  updateTripSchema,
  withoutScheduledIdeas,
  type ReviewRequest,
  type RunningEnhancementRun,
  type Trip,
  type TripDay,
  type TripAccess,
  type TripInvite,
} from "../trips/types"

// ── /api/trips router ────────────────────────────────────────────────────
//
// All endpoints require an authenticated user (Clerk). Dependencies (store,
// auth, LLM, geocoder, weather) are injected so the router is fully testable
// without external services.

export interface TripsRouterDeps {
  store: TripStore
  /** Resolves the Authorization header to a userId, or null. */
  verifyAuth: (authHeader: string | undefined) => Promise<string | null>
  llm?: LlmCall | null
  geocode?: Geocoder | null
  fetchWeather?: WeatherFetcher
  /** How long /generate waits before switching to a heartbeat body (tests shorten it). */
  generateGraceMs?: number
  /** Gap between keep-alive bytes on a slow /generate body (tests shorten it). */
  generateHeartbeatMs?: number
  /** Runs after the auth gate, so it can key on the signed-in user. */
  rateLimit?: MiddlewareHandler
  /** Reads bookings out of a pasted confirmation. Undefined: built from the server's Gemini / Groq keys; null: not available (503). */
  parseBookings?: BookingParser | null
  /** Recommends days for a wishlist idea. Undefined: Gemini 4 Hydrogen from the server's Gemini key, or the distance ranking alone without one. */
  suggestDays?: DaySuggester
  /** Runs queued AI reviews; `/enhance` kicks it with each new run. The
   *  server passes the one worker it also sweeps with. Undefined: a worker
   *  over `store` and `llm` that only takes the runs it is kicked with (and
   *  their retries), never sweeping for other due runs. */
  reviewWorker?: ReviewWorker
}

/** About twice the largest real save: a whole trip with 200 ideas, 1000
 *  expenses and long Korean notes is about 1 MB of JSON. */
const MAX_WRITE_BYTES = 2 * 1024 * 1024
const MAX_SUMMARY_POINTS = 48
const round4 = (n: number) => Math.round(n * 1e4) / 1e4

/** Evenly pick at most `max` entries, keeping the first and last. */
function downsample<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list
  const step = (list.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => list[Math.round(i * step)]!)
}

/** Full trip as a response body. Invite tokens are owner-only. */
function present(trip: Trip, access: TripAccess): Trip {
  if (access === "owner" || !trip.invites) return trip
  const { invites: _invites, ...rest } = trip
  return rest
}

/** URL-safe, crypto-random invite token (32 chars). */
function newInviteToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")
}

function summarize(trip: Trip, userId: string) {
  const located = trip.days.flatMap((d) =>
    d.items.flatMap((i) =>
      typeof i.location?.lat === "number" && typeof i.location?.lng === "number"
        ? [{ lat: i.location.lat, lng: i.location.lng }]
        : [],
    ),
  )
  const center =
    trip.center ??
    (located.length > 0
      ? {
          lat: located.reduce((n, p) => n + p.lat, 0) / located.length,
          lng: located.reduce((n, p) => n + p.lng, 0) / located.length,
        }
      : undefined)
  return {
    id: trip.id,
    slug: trip.slug,
    name: trip.name,
    destinations: trip.destinations,
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: trip.timezone,
    status: trip.status,
    tags: trip.tags,
    description: trip.description,
    accent: trip.appearance?.accent,
    collaborators: trip.collaborators,
    sharedWithAllUsers: trip.sharedWithAllUsers ?? false,
    dayCount: trip.days.length,
    itemCount: trip.days.reduce((n, d) => n + d.items.length, 0),
    center,
    points: downsample(located, MAX_SUMMARY_POINTS).map((p) => [round4(p.lng), round4(p.lat)] as [number, number]),
    // The overview's "Places": every place and booking, pinned or not.
    placeCount: trip.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "place" || i.kind === "reservation").length, 0),
    access: accessFor(trip, userId),
    updatedAt: trip.updatedAt,
  }
}

const FALLBACK_CATEGORY: PlaceCategory = "landmark"

function asPlaceCategory(category: string | undefined): PlaceCategory {
  return category && category in categoryIcon ? (category as PlaceCategory) : FALLBACK_CATEGORY
}

/** Serialises async work per key inside this process (the server runs as
 *  one process), for read-check-write sequences the store cannot make
 *  atomic on its own. */
function createKeyedLock() {
  const tails = new Map<string, Promise<unknown>>()
  return async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const run = (tails.get(key) ?? Promise.resolve()).then(work)
    const tail = run.catch(() => {})
    tails.set(key, tail)
    try {
      return await run
    } finally {
      if (tails.get(key) === tail) tails.delete(key)
    }
  }
}

/** `drafted` with each day's journal and zone from the day of the same date in `before`. */
export function keepDayNotes(drafted: TripDay[], before: TripDay[]): TripDay[] {
  const byDate = new Map(before.map((day) => [day.date, day]))
  return drafted.map((day) => {
    const was = byDate.get(day.date)
    if (!was || (was.journal === undefined && was.timezone === undefined)) return day
    return {
      ...day,
      ...(was.journal !== undefined ? { journal: was.journal } : {}),
      ...(was.timezone !== undefined ? { timezone: was.timezone } : {}),
    }
  })
}

/** One-time display-data upgrade for a Korea trip seeded before the dossier
 *  theming existed: backfill appearance + per-day neighborhoods / weather /
 *  callouts from the canonical seed, preserving the traveller's edits. */
function upgradeKoreaSeed(existing: Trip): Trip {
  if (existing.appearance && existing.slug) return existing
  const seed = buildKoreaTrip()
  return {
    ...existing,
    slug: existing.slug ?? seed.slug,
    appearance: existing.appearance ?? seed.appearance,
    days: existing.days.map((d) => {
      const seedDay = seed.days.find((s) => s.id === d.id)
      if (!seedDay) return d
      return {
        ...d,
        neighborhoods: d.neighborhoods ?? seedDay.neighborhoods,
        weather: d.weather ?? seedDay.weather,
        callouts: d.callouts ?? seedDay.callouts,
      }
    }),
  }
}

// Seed the Korea trip once per store so it appears as a normal trip.
const seededStores = new WeakSet<TripStore>()
async function ensureSeeded(store: TripStore) {
  if (seededStores.has(store)) return
  try {
    const existing = await store.get(KOREA_TRIP_ID)
    if (!existing) await store.create(buildKoreaTrip())
    else await mutateTrip(store, KOREA_TRIP_ID, upgradeKoreaSeed)
    seededStores.add(store)
  } catch (err) {
    console.warn("[trips] korea seed failed:", err instanceof Error ? err.message : err)
  }
}

export function createTripsRouter(deps: TripsRouterDeps) {
  const trips = new Hono()

  // A database that hasn't had supabase/schema.sql (or the review queue
  // migration) applied yet should fail loud-but-actionable, not as an opaque 500.
  trips.onError((err, c) => {
    if (isNotProvisionedError(err)) {
      return c.json(
        {
          error: "trips_not_provisioned",
          message:
            "The trips tables or the AI review queue are missing — apply supabase/schema.sql and " +
            "supabase/migrations/20261121_trip_review_queue.sql to the database.",
        },
        503,
      )
    }
    console.error("[trips] unhandled error:", err instanceof Error ? err.message : err)
    return c.json({ error: "internal_error" }, 500)
  })

  // Auth gate for every trips endpoint.
  trips.use("*", async (c, next) => {
    const userId = await deps.verifyAuth(c.req.header("Authorization"))
    if (!userId) return c.json({ error: "unauthorized" }, 401)
    c.set("userId" as never, userId as never)
    await next()
  })
  if (deps.rateLimit) trips.use("*", deps.rateLimit)
  trips.use(
    "*",
    bodyLimit({
      maxSize: MAX_WRITE_BYTES,
      onError: (c) => c.json({ error: "too_large", message: "This trip is too big to save. Remove some stops, ideas or expenses, then try again." }, 413),
    }),
  )

  const userIdOf = (c: Context) => c.get("userId" as never) as string
  const withLock = createKeyedLock()
  const mutate = (tripId: string, change: (trip: Trip) => Trip) => mutateTrip(deps.store, tripId, change)
  const reviews =
    deps.reviewWorker ??
    (deps.llm
      ? createTripReviewWorker({ store: deps.store, llm: deps.llm, fetchWeather: deps.fetchWeather, geocode: deps.geocode })
      : null)

  /** Resolve a trip by id, falling back to its permalink slug. */
  async function resolveTrip(idOrSlug: string): Promise<Trip | null> {
    return (await deps.store.get(idOrSlug)) ?? (await deps.store.getBySlug(idOrSlug))
  }

  /** True when `slug` cannot be a permalink for trip `excludeId`: reserved,
   *  or already some other trip's slug or id. */
  async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) return true
    const [byId, bySlug] = await Promise.all([deps.store.get(slug), deps.store.getBySlug(slug)])
    return [byId, bySlug].some((t) => t !== null && t.id !== excludeId)
  }

  /** Unique permalink: base, base-2, base-3, … (excluding the trip itself). */
  async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const fallback = base || "trip"
    if (!(await slugTaken(fallback, excludeId))) return fallback
    for (let n = 2; n < 100; n++) {
      const candidate = `${fallback}-${n}`
      if (!(await slugTaken(candidate, excludeId))) return candidate
    }
    return `${fallback}-${newId("x").slice(2)}`
  }

  /** Load trip + enforce access. Returns a Response on failure. A trip the
   *  caller cannot see answers 404, like one that does not exist, so ids
   *  and slugs cannot be probed. */
  async function loadTrip(c: Context, id: string, needEdit = false) {
    const trip = await resolveTrip(id)
    if (!trip) return { error: c.json({ error: "trip not found" }, 404) }
    const access = accessFor(trip, userIdOf(c))
    if (!canView(access)) return { error: c.json({ error: "trip not found" }, 404) }
    if (needEdit && !canEdit(access)) return { error: c.json({ error: "forbidden" }, 403) }
    return { trip, access }
  }

  const loadForEdit = async (c: Context) => {
    await ensureSeeded(deps.store)
    return loadTrip(c, c.req.param("id") ?? "", true)
  }

  registerBookingRoutes(trips, {
    parse:
      deps.parseBookings !== undefined
        ? deps.parseBookings
        : createBookingParserFromKeys({ geminiApiKey: config.geminiApiKey, groqApiKey: config.groqApiKey, geocode: deps.geocode }),
    load: loadForEdit,
  })

  registerIdeaRoutes(trips, {
    suggest: deps.suggestDays ?? createDaySuggesterFromKeys({ geminiApiKey: config.geminiApiKey }),
    load: loadForEdit,
  })

  // ── Sharing: join by invite link ───────────────────────────────────────
  //
  // Registered ahead of every `/:id/...` route so "join" is never read as a
  // trip id.

  trips.post("/join/:token", async (c) => {
    const body = joinTripSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    const token = c.req.param("token")
    const userId = userIdOf(c)
    const name = body.data.name || undefined
    const holder = await deps.store.findByInviteToken(token)
    if (!holder) return c.json({ error: "invite_not_found" }, 404)

    const joined = await mutate(holder.id, (trip) => {
      // Re-check on the fresh copy: the owner may have revoked it meanwhile.
      const invite = trip.invites?.find((i) => i.token === token)
      if (!invite || trip.ownerId === userId) return trip
      const existing = trip.collaborators.find((col) => col.userId === userId)
      if (!existing) {
        return {
          ...trip,
          collaborators: [...trip.collaborators, { userId, role: invite.role, ...(name ? { name } : {}) }],
        }
      }
      // A link sets the role of someone new only. Someone already on the trip
      // keeps the role the owner gave them, so an old editor link cannot undo
      // a downgrade to viewer.
      if (!name || name === existing.name) return trip
      return { ...trip, collaborators: trip.collaborators.map((col) => (col === existing ? { ...col, name } : col)) }
    })
    if (!joined) return c.json({ error: "invite_not_found" }, 404)
    const access = accessFor(joined, userId)
    if (!canView(access)) return c.json({ error: "invite_not_found" }, 404)
    return c.json({ trip: { id: joined.id, slug: joined.slug, name: joined.name }, access })
  })

  // ── CRUD ───────────────────────────────────────────────────────────────

  trips.get("/", async (c) => {
    await ensureSeeded(deps.store)
    const userId = userIdOf(c)
    const all = await deps.store.list()
    const visible = all.filter((t) => canView(accessFor(t, userId)))
    visible.sort((a, b) => b.startDate.localeCompare(a.startDate))
    return c.json({ trips: visible.map((t) => summarize(t, userId)) })
  })

  // Static path must be registered before `GET /:id` or "places-catalog"
  // is treated as a trip id and 404s.
  trips.get("/places-catalog", async (c) => {
    await ensureSeeded(deps.store)
    const userId = userIdOf(c)
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20) || 20))
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0)
    const visible = (await deps.store.list()).filter((t) => canView(accessFor(t, userId)))
    const all = collectCatalogPlaces(visible)
    const slice = all.slice(offset, offset + limit)
    return c.json({
      total: all.length,
      offset,
      limit,
      hasMore: offset + limit < all.length,
      groups: groupCatalogPlaces(slice),
    })
  })

  trips.post("/", async (c) => {
    const body = createTripSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid trip", issues: body.error.issues }, 400)
    if (body.data.endDate < body.data.startDate) {
      return c.json({ error: "endDate must be on or after startDate" }, 400)
    }
    const now = nowIso()
    const id = newId("trip")
    const trip: Trip = {
      id,
      slug: await uniqueSlug(defaultTripSlug({ id, ...body.data })),
      ownerId: userIdOf(c),
      ...body.data,
      days: emptyDays(body.data.startDate, body.data.endDate),
      createdAt: now,
      updatedAt: now,
    }
    await deps.store.create(trip)
    return c.json({ trip }, 201)
  })

  trips.get("/:id", async (c) => {
    await ensureSeeded(deps.store)
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    return c.json({ trip: present(result.trip, result.access), access: result.access })
  })

  trips.patch("/:id", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = updateTripSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid update", issues: body.error.issues }, 400)
    const { baseUpdatedAt, ...patch } = body.data
    // Only the owner may change sharing-relevant fields (collaborators).
    if (patch.collaborators && result.access !== "owner") {
      return c.json({ error: "only the owner can change collaborators" }, 403)
    }
    // Custom permalinks must stay unique across all trips (ids included).
    if (patch.slug && patch.slug !== result.trip.slug && (await slugTaken(patch.slug, result.trip.id))) {
      return c.json({ error: "slug_taken", message: `The permalink “${patch.slug}” is already in use.` }, 409)
    }

    // The patch lands on the stored trip, never on a stale copy: fields the
    // body does not name (invites, collaborators, …) keep their stored value.
    // With `baseUpdatedAt`, a save based on an older version is refused with
    // the current trip so the client can rebase; without it (older clients)
    // the patch is merged as before.
    const userId = userIdOf(c)
    let fresh: Trip | null = result.trip
    for (let attempt = 0; attempt < PERSIST_RETRIES; attempt++) {
      if (attempt > 0) fresh = await deps.store.get(result.trip.id)
      if (!fresh) return c.json({ error: "trip not found" }, 404)
      const access = accessFor(fresh, userId)
      if (!canEdit(access)) return c.json({ error: "trip not found" }, 404)
      if (baseUpdatedAt !== undefined && fresh.updatedAt !== baseUpdatedAt) {
        return c.json({ error: "conflict", trip: present(fresh, access) }, 409)
      }
      const next: Trip = withoutScheduledIdeas({
        ...fresh,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        description: patch.description === null ? undefined : (patch.description ?? fresh.description),
        budget: patch.budget === null ? undefined : (patch.budget ?? fresh.budget),
        updatedAt: nextUpdatedAt(fresh.updatedAt),
      })
      if (next.endDate < next.startDate) {
        return c.json({ error: "endDate must be on or after startDate" }, 400)
      }
      if (await deps.store.updateIfUnchanged(next, fresh.updatedAt)) {
        return c.json({ trip: present(next, access) })
      }
    }
    throw new Error("Trip kept changing while saving")
  })

  trips.delete("/:id", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    if (result.access !== "owner") return c.json({ error: "only the owner can delete a trip" }, 403)
    await deps.store.delete(result.trip.id)
    return c.json({ ok: true })
  })

  // ── Sharing: invite links + leaving ────────────────────────────────────

  trips.post("/:id/invites", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    if (result.access !== "owner") return c.json({ error: "only the owner can manage invites" }, 403)
    const body = createInviteSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    const role = body.data.role
    const next = await mutate(result.trip.id, (trip) => {
      if (trip.invites?.some((i) => i.role === role)) return trip
      const invite: TripInvite = { token: newInviteToken(), role, createdAt: nowIso() }
      return { ...trip, invites: [...(trip.invites ?? []), invite] }
    })
    const invite = next?.invites?.find((i) => i.role === role)
    if (!invite) return c.json({ error: "trip not found" }, 404)
    return c.json({ invite })
  })

  trips.delete("/:id/invites/:token", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    if (result.access !== "owner") return c.json({ error: "only the owner can manage invites" }, 403)
    const token = c.req.param("token")
    await mutate(result.trip.id, (trip) =>
      trip.invites?.some((i) => i.token === token)
        ? { ...trip, invites: trip.invites.filter((i) => i.token !== token) }
        : trip,
    )
    return c.json({ ok: true })
  })

  trips.post("/:id/leave", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    if (result.access === "owner") return c.json({ error: "owner_cannot_leave" }, 400)
    const userId = userIdOf(c)
    await mutate(result.trip.id, (trip) =>
      trip.collaborators.some((col) => col.userId === userId)
        ? { ...trip, collaborators: trip.collaborators.filter((col) => col.userId !== userId) }
        : trip,
    )
    return c.json({ ok: true })
  })

  // ── AI: starter itinerary ──────────────────────────────────────────────

  trips.post("/:id/generate", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = generateRequestSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (!deps.llm) return c.json({ error: "ai_not_configured", message: "GEMINI_API_KEY or GROQ_API_KEY missing" }, 503)

    const hasItems = result.trip.days.some((d) => d.items.length > 0)
    if (hasItems && !body.data.replaceExisting) {
      return c.json({ error: "itinerary_not_empty", message: "pass replaceExisting: true to overwrite" }, 409)
    }

    const tripId = result.trip.id
    const userId = userIdOf(c)
    const llm = deps.llm
    type Outcome = { status: 200 | 404 | 502; body: Record<string, unknown> }
    const work: Promise<Outcome> = (async () => {
      try {
        const generated = await generateItinerary({
          trip: result.trip,
          prompt: body.data.prompt,
          preferences: body.data.preferences,
          llm,
          geocode: deps.geocode,
        })
        // Only the draft's own fields land, and on the trip as it is now:
        // sharing changes or a rename made while the model worked survive.
        // What the traveller wrote about a day, and the zone they set for it,
        // belong to the date, not the draft: they carry over.
        const next = await mutate(tripId, (fresh) => ({
          ...fresh,
          days: keepDayNotes(generated.days, fresh.days),
          // AI-proposed theming fills gaps but never overwrites user choices.
          appearance: { ...generated.appearance, ...fresh.appearance },
        }))
        if (!next) return { status: 404 as const, body: { error: "trip not found" } }
        return {
          status: 200 as const,
          body: {
            trip: present(next, accessFor(next, userId)),
            summary: generated.summary,
            incompleteDays: generated.incompleteDays,
          },
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn("[trips/generate] failed:", message)
        return { status: 502 as const, body: { error: "generation_failed", message } }
      }
    })()

    // A grounded draft of a long trip can outlast a reverse proxy's idle
    // timeout (60 s), which surfaced as a bare 504 with the work still
    // running. Quick drafts answer normally; slow ones switch to a body that
    // trickles whitespace (valid before JSON) until the result is ready, so
    // the connection never goes quiet. A failure after that point arrives as
    // `{ error, message }` on a 200, which the client treats as a failure.
    const quick = await Promise.race([
      work,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), deps.generateGraceMs ?? 15_000)),
    ])
    if (quick) return c.json(quick.body, quick.status)

    // The client may leave at any point (closed tab, proxy timeout). Every
    // write checks `closed` first: enqueueing on a cancelled stream throws,
    // and from inside a timer that throw is uncaught and ends the process.
    // The draft itself still finishes and is saved.
    const encoder = new TextEncoder()
    let closed = false
    let beat: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      closed = true
      clearInterval(beat)
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (text: string) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            stop()
          }
        }
        beat = setInterval(() => push(" \n"), deps.generateHeartbeatMs ?? 8_000)
        push(" \n")
        void work.then((outcome) => {
          push(JSON.stringify(outcome.body))
          if (closed) return
          stop()
          try {
            controller.close()
          } catch {
            // Already closed by the other side: nothing left to tell it.
          }
        })
      },
      cancel() {
        stop()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    })
  })

  // ── AI: enhancement (reviewable suggestions) ───────────────────────────
  //
  // A review takes minutes (Gemini Maps + tool ladder), far past a reverse
  // proxy's idle timeout, so it is never done on the request. POST queues a
  // run in the store (the durable review queue) and kicks the review worker;
  // the editor polls GET /enhancements/:runId until status leaves "running".
  // The run survives a restart: another worker claims it when the lease
  // lapses, and a failed attempt is retried (`run.queue` says where it is).

  trips.post("/:id/enhance", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = enhanceRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (body.data.scope === "day" && !body.data.dayId) {
      return c.json({ error: "dayId required for day scope" }, 400)
    }
    if (!deps.llm || !reviews) {
      return c.json({ error: "ai_not_configured", message: "GEMINI_API_KEY or GROQ_API_KEY missing" }, 503)
    }

    const { scope, prompt } = body.data
    const dayId = scope === "day" ? body.data.dayId : undefined
    const pending: RunningEnhancementRun = {
      id: newId("run"),
      tripId: result.trip.id,
      scope,
      dayId,
      status: "running",
      suggestions: [],
      appliedSuggestionIds: [],
      createdAt: nowIso(),
    }
    const request: ReviewRequest = { scope, ...(dayId ? { dayId } : {}), ...(prompt ? { prompt } : {}) }
    // One live review per trip, enforced by the store: two would each
    // auto-apply their adds onto the same days. The body carries the run in
    // flight, so a client that polls on `run.status === "running"` simply
    // follows the review already going.
    const queued = await deps.store.enqueueReview(pending, request, REVIEW_MAX_ATTEMPTS)
    if (!queued.inserted) {
      return c.json(
        { error: "enhancement_running", message: "An AI review of this trip is already running.", run: queued.live },
        409,
      )
    }
    reviews.kick(queued.run.id)
    return c.json({ run: queued.run }, 202)
  })

  trips.get("/:id/enhancements", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    const now = Date.now()
    return c.json({ runs: (await deps.store.listRuns(result.trip.id)).map((run) => settleStaleRun(run, now)) })
  })

  trips.get("/:id/enhancements/:runId", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    const stored = await deps.store.getRun(result.trip.id, c.req.param("runId"))
    if (!stored) return c.json({ error: "run not found" }, 404)
    const run = settleStaleRun(stored)
    // Re-read after the run: the review may have finished between loadTrip
    // and getRun, and the client stops polling on a terminal status.
    const trip = (await deps.store.get(result.trip.id)) ?? result.trip
    return c.json({
      run,
      trip: present(trip, result.access),
      applied: run.appliedSuggestionIds,
      ...(run.status === "error" ? { error: "enhancement_failed" as const, message: run.error } : {}),
    })
  })

  trips.post("/:id/enhancements/:runId/apply", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = applySuggestionsSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    const tripId = result.trip.id
    const runId = c.req.param("runId")
    const userId = userIdOf(c)

    // Read the run, apply onto the fresh trip, record what landed: all under
    // one lock per run, so two clicks cannot both apply the same suggestion.
    return withLock(`apply:${runId}`, async () => {
      const stored = await deps.store.getRun(tripId, runId)
      if (!stored) return c.json({ error: "run not found" }, 404)
      const run = settleStaleRun(stored)
      if (run.status !== "complete") {
        return c.json({ error: "run_not_complete", message: "This AI review has not finished.", run }, 409)
      }
      let outcome: Omit<AppliedSuggestions, "trip"> = { applied: [], skipped: [], skipReasons: {} }
      const next = await mutate(tripId, (fresh) => {
        const { trip, ...result } = applySuggestions(fresh, run, body.data.suggestionIds)
        outcome = result
        return result.applied.length > 0 ? trip : fresh
      })
      if (!next) return c.json({ error: "trip not found" }, 404)
      const { applied, skipped, skipReasons } = outcome
      if (applied.length > 0) {
        await deps.store.saveRun({ ...run, appliedSuggestionIds: [...run.appliedSuggestionIds, ...applied] })
      }
      return c.json({ trip: present(next, accessFor(next, userId)), applied, skipped, skipReasons })
    })
  })


  // ── AI: concierge chat (SSE) ───────────────────────────────────────────

  trips.post("/:id/chat", async (c) => {
    await ensureSeeded(deps.store)
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    const body = tripChatRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (body.data.dayId && !result.trip.days.some((d) => d.id === body.data.dayId)) {
      return c.json({ error: "day not found" }, 404)
    }
    return streamTripChat(c, {
      trip: result.trip,
      prompt: body.data.prompt,
      dayId: body.data.dayId,
      messages: body.data.messages ?? [],
      location: body.data.location,
      geocode: deps.geocode,
    })
  })

  // ── Map Mode: per-day places in the existing PlacesResponse contract ───

  trips.get("/:id/days/:dayId/places", async (c) => {
    await ensureSeeded(deps.store)
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    const trip = result.trip
    const day = trip.days.find((d) => d.id === c.req.param("dayId"))
    if (!day) return c.json({ error: "day not found" }, 404)

    const userLat = c.req.query("lat") ? parseFloat(c.req.query("lat")!) : undefined
    const userLng = c.req.query("lng") ? parseFloat(c.req.query("lng")!) : undefined

    const located = day.items.filter((i) => i.location?.lat != null && i.location?.lng != null)
    let places = located.map((item, order) => {
      const loc = item.location!
      const category = asPlaceCategory(loc.category)
      const scheduled = item.kind === "reservation" || item.status === "booked"
      return {
        id: item.id,
        name: loc.name,
        category,
        icon: categoryIcon[category],
        color: categoryColor[category],
        lat: loc.lat!,
        lng: loc.lng!,
        city: day.city ?? trip.destinations[0] ?? "",
        address: loc.address,
        description: item.notes ?? item.title,
        // Clients look photos up themselves; the field stays for the shared shape.
        photoUrl: "",
        priority: (scheduled ? "scheduled" : "core") as "scheduled" | "core" | "supplemental",
        reason: scheduled
          ? item.reservation
            ? `Reservation: ${item.title}`
            : `Booked: ${item.title}`
          : `Itinerary stop ${order + 1}`,
        reservationId: item.reservation ? item.id : undefined,
        reservationTime: item.time,
        distanceMeters: undefined as number | undefined,
        distanceLabel: undefined as string | undefined,
      }
    })

    if (typeof userLat === "number" && typeof userLng === "number" && !Number.isNaN(userLat) && !Number.isNaN(userLng)) {
      places = places.map((p) => {
        const d = haversineMeters({ lat: userLat, lng: userLng }, { lat: p.lat, lng: p.lng })
        return { ...p, distanceMeters: d, distanceLabel: formatDistance(d) }
      })
    }

    const anchor =
      located.find((i) => i.location!.category === "hotel") ?? located[0]
    const center = anchor
      ? { lat: anchor.location!.lat!, lng: anchor.location!.lng!, label: anchor.location!.name }
      : undefined

    const dayIndex = trip.days.findIndex((d) => d.id === day.id)
    return c.json({
      meta: {
        slug: day.id,
        testMode: false,
        city: day.city ?? trip.destinations[0] ?? "",
        day: {
          n: dayIndex + 1,
          title: day.title ?? `Day ${dayIndex + 1}`,
          hotel: located.find((i) => i.location!.category === "hotel")?.location!.name ?? "",
        },
        center,
      },
      places: places.slice(0, 60),
      igSaves: [],
      neighborhoods: [],
    })
  })

  return trips
}
