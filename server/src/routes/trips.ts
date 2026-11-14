import { Hono, type Context } from "hono"
import { categoryColor, categoryIcon, formatDistance, haversineMeters, type PlaceCategory } from "../data/koreaPlaces"
import {
  applySuggestions,
  autoApplyAddSuggestions,
  enhanceTrip,
  fetchOpenMeteoWeather,
  generateItinerary,
  type Geocoder,
  type LlmCall,
  type WeatherFetcher,
} from "../trips/ai"
import { streamTripChat } from "../trips/chat"
import { collectCatalogPlaces, groupCatalogPlaces } from "../trips/placeCatalog"
import { buildKoreaTrip, KOREA_TRIP_ID } from "../trips/koreaTrip"
import { isNotProvisionedError, type TripStore } from "../trips/store"
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
  slugify,
  updateTripSchema,
  type EnhancementRun,
  type Trip,
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
}

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
    placeCount: located.length,
    access: accessFor(trip, userId),
    updatedAt: trip.updatedAt,
  }
}

const FALLBACK_CATEGORY: PlaceCategory = "landmark"

function asPlaceCategory(category: string | undefined): PlaceCategory {
  return category && category in categoryIcon ? (category as PlaceCategory) : FALLBACK_CATEGORY
}

const PERSIST_RETRIES = 3

function applyCompletedEnhancement(trip: Trip, run: EnhancementRun): { trip: Trip; run: EnhancementRun } {
  let next = trip
  let nextRun = run
  if (run.weatherByDate && Object.keys(run.weatherByDate).length > 0) {
    next = {
      ...next,
      days: next.days.map((d) => (run.weatherByDate![d.date] ? { ...d, weather: run.weatherByDate![d.date] } : d)),
      updatedAt: nowIso(),
    }
  }
  const appliedAdds = autoApplyAddSuggestions(next, nextRun)
  return { trip: appliedAdds.trip, run: appliedAdds.run }
}

/** Finish an enhancement off the request thread: apply weather + add
 *  suggestions, then persist. Re-reads the trip and CAS-writes so a
 *  concurrent PATCH is remeshed instead of overwritten. */
async function persistEnhancementRun(args: {
  store: TripStore
  tripId: string
  snapshot: Trip
  pending: EnhancementRun
  work: Promise<EnhancementRun>
}): Promise<void> {
  try {
    const run = await args.work
    run.id = args.pending.id
    run.createdAt = args.pending.createdAt
    if (run.status !== "complete") {
      await args.store.saveRun(run)
      return
    }
    for (let attempt = 0; attempt < PERSIST_RETRIES; attempt++) {
      const fresh = await args.store.get(args.tripId)
      if (!fresh) throw new Error("Trip was deleted before enhancement completion")
      const seenUpdatedAt = fresh.updatedAt
      const applied = applyCompletedEnhancement(fresh, run)
      if (applied.trip === fresh) {
        await args.store.saveRun(applied.run)
        return
      }
      if (await args.store.updateIfUnchanged(applied.trip, seenUpdatedAt)) {
        await args.store.saveRun(applied.run)
        return
      }
    }
    throw new Error("Trip changed while applying enhancement")
  } catch (err) {
    const failed: EnhancementRun = {
      ...args.pending,
      status: "error",
      outcome: "no_adds_possible",
      outcomeReason: "The AI review failed before it could add places.",
      error: err instanceof Error ? err.message : String(err),
    }
    await args.store.saveRun(failed)
  }
}

// Seed the Korea trip once per store so it appears as a normal trip.
const seededStores = new WeakSet<TripStore>()
async function ensureSeeded(store: TripStore) {
  if (seededStores.has(store)) return
  try {
    const existing = await store.get(KOREA_TRIP_ID)
    if (!existing) {
      await store.create(buildKoreaTrip())
    } else if (!existing.appearance || !existing.slug) {
      // One-time display-data upgrade for trips seeded before the dossier
      // theming existed: backfill appearance + per-day neighborhoods /
      // weather / callouts from the canonical seed, preserving any item
      // edits the user has made since.
      const seed = buildKoreaTrip()
      await store.update({
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
        updatedAt: nowIso(),
      })
    }
    seededStores.add(store)
  } catch (err) {
    console.warn("[trips] korea seed failed:", err instanceof Error ? err.message : err)
  }
}

export function createTripsRouter(deps: TripsRouterDeps) {
  const trips = new Hono()

  // A database that hasn't had supabase/schema.sql applied yet should fail
  // loud-but-actionable, not as an opaque 500.
  trips.onError((err, c) => {
    if (isNotProvisionedError(err)) {
      return c.json(
        {
          error: "trips_not_provisioned",
          message: "The trips tables are missing — apply supabase/schema.sql to the database.",
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

  const userIdOf = (c: Context) => c.get("userId" as never) as string

  /** Resolve a trip by id, falling back to its permalink slug. */
  async function resolveTrip(idOrSlug: string): Promise<Trip | null> {
    const byId = await deps.store.get(idOrSlug)
    if (byId) return byId
    const all = await deps.store.list()
    return all.find((t) => t.slug === idOrSlug) ?? null
  }

  /** Unique permalink: base, base-2, base-3, … (excluding the trip itself). */
  async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const fallback = base || "trip"
    const all = await deps.store.list()
    const taken = new Set(all.filter((t) => t.id !== excludeId).flatMap((t) => [t.slug, t.id]))
    if (!taken.has(fallback)) return fallback
    for (let n = 2; n < 100; n++) {
      const candidate = `${fallback}-${n}`
      if (!taken.has(candidate)) return candidate
    }
    return `${fallback}-${newId("x").slice(2)}`
  }

  /** Load trip + enforce access. Returns a Response on failure. */
  async function loadTrip(c: Context, id: string, needEdit = false) {
    const trip = await resolveTrip(id)
    if (!trip) return { error: c.json({ error: "trip not found" }, 404) }
    const access = accessFor(trip, userIdOf(c))
    if (!canView(access) || (needEdit && !canEdit(access))) {
      return { error: c.json({ error: "forbidden" }, 403) }
    }
    return { trip, access }
  }

  /** Re-read + CAS-write a sharing change so it can't clobber (or be lost
   *  to) a concurrent document save. `change` returns the trip untouched
   *  when there is nothing to do. */
  async function mutateTrip(tripId: string, change: (trip: Trip) => Trip): Promise<Trip | null> {
    for (let attempt = 0; attempt < PERSIST_RETRIES; attempt++) {
      const fresh = await deps.store.get(tripId)
      if (!fresh) return null
      const changed = change(fresh)
      if (changed === fresh) return fresh
      const next = { ...changed, updatedAt: nowIso() }
      if (await deps.store.updateIfUnchanged(next, fresh.updatedAt)) return next
    }
    throw new Error("Trip changed while updating sharing")
  }

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
    const holder = (await deps.store.list()).find((t) => t.invites?.some((i) => i.token === token))
    if (!holder) return c.json({ error: "invite_not_found" }, 404)

    const joined = await mutateTrip(holder.id, (trip) => {
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
      const role = invite.role === "editor" ? "editor" : existing.role
      const nextName = name ?? existing.name
      if (role === existing.role && nextName === existing.name) return trip
      return {
        ...trip,
        collaborators: trip.collaborators.map((col) =>
          col === existing ? { ...col, role, ...(nextName ? { name: nextName } : {}) } : col,
        ),
      }
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
    // Intelligent default permalink: trip name + year, deduped.
    const baseSlug = slugify(`${body.data.name} ${body.data.startDate.slice(0, 4)}`)
    const trip: Trip = {
      id: newId("trip"),
      slug: await uniqueSlug(baseSlug),
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
    const patch = body.data
    // Only the owner may change sharing-relevant fields (collaborators).
    if (patch.collaborators && result.access !== "owner") {
      return c.json({ error: "only the owner can change collaborators" }, 403)
    }
    // Custom permalinks must stay unique across all trips (ids included).
    if (patch.slug && patch.slug !== result.trip.slug) {
      const all = await deps.store.list()
      const clash = all.some((t) => t.id !== result.trip.id && (t.slug === patch.slug || t.id === patch.slug))
      if (clash) {
        return c.json({ error: "slug_taken", message: `The permalink “${patch.slug}” is already in use.` }, 409)
      }
    }
    const next: Trip = {
      ...result.trip,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      description: patch.description === null ? undefined : (patch.description ?? result.trip.description),
      updatedAt: nowIso(),
    }
    if (next.endDate < next.startDate) {
      return c.json({ error: "endDate must be on or after startDate" }, 400)
    }
    await deps.store.update(next)
    return c.json({ trip: present(next, result.access) })
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
    const next = await mutateTrip(result.trip.id, (trip) => {
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
    await mutateTrip(result.trip.id, (trip) =>
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
    await mutateTrip(result.trip.id, (trip) =>
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

    const trip = result.trip
    const access = result.access
    const llm = deps.llm
    type Outcome = { status: 200 | 502; body: Record<string, unknown> }
    const work: Promise<Outcome> = (async () => {
      try {
        const generated = await generateItinerary({
          trip,
          prompt: body.data.prompt,
          preferences: body.data.preferences,
          llm,
          geocode: deps.geocode,
        })
        const next: Trip = {
          ...trip,
          days: generated.days,
          // AI-proposed theming fills gaps but never overwrites user choices.
          appearance: { ...generated.appearance, ...trip.appearance },
          updatedAt: nowIso(),
        }
        await deps.store.update(next)
        return { status: 200 as const, body: { trip: present(next, access), summary: generated.summary, incompleteDays: generated.incompleteDays } }
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

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const beat = setInterval(() => controller.enqueue(encoder.encode(" \n")), 8_000)
        controller.enqueue(encoder.encode(" \n"))
        void work.then((outcome) => {
          clearInterval(beat)
          controller.enqueue(encoder.encode(JSON.stringify(outcome.body)))
          controller.close()
        })
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    })
  })

  // ── AI: enhancement (reviewable suggestions) ───────────────────────────
  //
  // The LLM call (Gemini Maps + tool ladder) regularly exceeds reverse-
  // proxy idle timeouts, which used to surface as a naked 502. Start the run
  // immediately and finish it in the background; the editor polls GET
  // /enhancements/:runId until status leaves "running".

  trips.post("/:id/enhance", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = enhanceRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (body.data.scope === "day" && !body.data.dayId) {
      return c.json({ error: "dayId required for day scope" }, 400)
    }
    if (!deps.llm) return c.json({ error: "ai_not_configured", message: "GEMINI_API_KEY or GROQ_API_KEY missing" }, 503)

    const pending: EnhancementRun = {
      id: newId("run"),
      tripId: result.trip.id,
      scope: body.data.scope,
      dayId: body.data.scope === "day" ? body.data.dayId : undefined,
      status: "running",
      suggestions: [],
      appliedSuggestionIds: [],
      createdAt: nowIso(),
    }
    await deps.store.saveRun(pending)

    const tripId = result.trip.id
    const snapshot = result.trip
    const llm = deps.llm
    void persistEnhancementRun({
      store: deps.store,
      tripId,
      snapshot,
      pending,
      work: enhanceTrip({
        trip: snapshot,
        scope: body.data.scope,
        dayId: body.data.dayId,
        prompt: body.data.prompt,
        llm,
        fetchWeather: deps.fetchWeather ?? fetchOpenMeteoWeather,
        geocode: deps.geocode,
      }),
    }).catch((err) => {
      console.warn("[trips/enhance] background run failed:", err instanceof Error ? err.message : err)
    })

    return c.json({ run: pending }, 202)
  })

  trips.get("/:id/enhancements", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    return c.json({ runs: await deps.store.listRuns(result.trip.id) })
  })

  trips.get("/:id/enhancements/:runId", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    const run = await deps.store.getRun(result.trip.id, c.req.param("runId"))
    if (!run) return c.json({ error: "run not found" }, 404)
    // Re-read after the run: persist may have finished between loadTrip and
    // getRun, and the client stops polling on a terminal status.
    const trip = (await deps.store.get(result.trip.id)) ?? result.trip
    return c.json({
      run,
      trip: present(trip, result.access),
      applied: run.appliedSuggestionIds,
      ...(run.status === "error"
        ? { error: "enhancement_failed" as const, message: run.error ?? "enhancement failed" }
        : {}),
    })
  })

  trips.post("/:id/enhancements/:runId/apply", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = applySuggestionsSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    const run = await deps.store.getRun(result.trip.id, c.req.param("runId"))
    if (!run) return c.json({ error: "run not found" }, 404)

    const { trip: next, applied, skipped } = applySuggestions(result.trip, run, body.data.suggestionIds)
    if (applied.length > 0) {
      await deps.store.update(next)
      run.appliedSuggestionIds = [...run.appliedSuggestionIds, ...applied]
      await deps.store.saveRun(run)
    }
    return c.json({ trip: present(next, result.access), applied, skipped })
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
