import { Hono, type Context } from "hono"
import { categoryColor, categoryIcon, formatDistance, haversineMeters, type PlaceCategory } from "../data/koreaPlaces"
import {
  applySuggestions,
  enhanceTrip,
  fetchOpenMeteoWeather,
  generateItinerary,
  type Geocoder,
  type LlmCall,
  type WeatherFetcher,
} from "../trips/ai"
import { buildKoreaTrip, KOREA_TRIP_ID } from "../trips/koreaTrip"
import { isNotProvisionedError, type TripStore } from "../trips/store"
import {
  accessFor,
  applySuggestionsSchema,
  canEdit,
  canView,
  createTripSchema,
  enhanceRequestSchema,
  generateRequestSchema,
  newId,
  nowIso,
  emptyDays,
  slugify,
  updateTripSchema,
  type Trip,
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
}

function summarize(trip: Trip, userId: string) {
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
    collaborators: trip.collaborators,
    sharedWithAllUsers: trip.sharedWithAllUsers ?? false,
    dayCount: trip.days.length,
    itemCount: trip.days.reduce((n, d) => n + d.items.length, 0),
    access: accessFor(trip, userId),
    updatedAt: trip.updatedAt,
  }
}

const FALLBACK_CATEGORY: PlaceCategory = "landmark"

function asPlaceCategory(category: string | undefined): PlaceCategory {
  return category && category in categoryIcon ? (category as PlaceCategory) : FALLBACK_CATEGORY
}

function photoUrlFor(query: string): string {
  const seed = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)
  return `https://source.unsplash.com/featured/1200x800/?${encodeURIComponent(query)}&sig=${seed}`
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

  // ── CRUD ───────────────────────────────────────────────────────────────

  trips.get("/", async (c) => {
    await ensureSeeded(deps.store)
    const userId = userIdOf(c)
    const all = await deps.store.list()
    const visible = all.filter((t) => canView(accessFor(t, userId)))
    visible.sort((a, b) => b.startDate.localeCompare(a.startDate))
    return c.json({ trips: visible.map((t) => summarize(t, userId)) })
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
    return c.json({ trip: result.trip, access: result.access })
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
    return c.json({ trip: next })
  })

  trips.delete("/:id", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    if (result.access !== "owner") return c.json({ error: "only the owner can delete a trip" }, 403)
    await deps.store.delete(result.trip.id)
    return c.json({ ok: true })
  })

  // ── AI: starter itinerary ──────────────────────────────────────────────

  trips.post("/:id/generate", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = generateRequestSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (!deps.llm) return c.json({ error: "ai_not_configured", message: "GROQ_API_KEY missing" }, 503)

    const hasItems = result.trip.days.some((d) => d.items.length > 0)
    if (hasItems && !body.data.replaceExisting) {
      return c.json({ error: "itinerary_not_empty", message: "pass replaceExisting: true to overwrite" }, 409)
    }

    try {
      const generated = await generateItinerary({
        trip: result.trip,
        prompt: body.data.prompt,
        preferences: body.data.preferences,
        llm: deps.llm,
        geocode: deps.geocode,
      })
      const next: Trip = {
        ...result.trip,
        days: generated.days,
        // AI-proposed theming fills gaps but never overwrites user choices.
        appearance: { ...generated.appearance, ...result.trip.appearance },
        updatedAt: nowIso(),
      }
      await deps.store.update(next)
      return c.json({ trip: next, summary: generated.summary })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn("[trips/generate] failed:", message)
      return c.json({ error: "generation_failed", message }, 502)
    }
  })

  // ── AI: enhancement (reviewable suggestions) ───────────────────────────

  trips.post("/:id/enhance", async (c) => {
    const result = await loadTrip(c, c.req.param("id"), true)
    if ("error" in result) return result.error
    const body = enhanceRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400)
    if (body.data.scope === "day" && !body.data.dayId) {
      return c.json({ error: "dayId required for day scope" }, 400)
    }
    if (!deps.llm) return c.json({ error: "ai_not_configured", message: "GROQ_API_KEY missing" }, 503)

    const run = await enhanceTrip({
      trip: result.trip,
      scope: body.data.scope,
      dayId: body.data.dayId,
      prompt: body.data.prompt,
      llm: deps.llm,
      fetchWeather: deps.fetchWeather ?? fetchOpenMeteoWeather,
    })
    await deps.store.saveRun(run)
    // Trusted auto-sync: refresh day.weather from the live forecast fetched
    // during the run (metadata, not an itinerary change — no review needed).
    let trip = result.trip
    if (run.weatherByDate && Object.keys(run.weatherByDate).length > 0) {
      trip = {
        ...trip,
        days: trip.days.map((d) => (run.weatherByDate![d.date] ? { ...d, weather: run.weatherByDate![d.date] } : d)),
        updatedAt: nowIso(),
      }
      await deps.store.update(trip)
    }
    return c.json({ run, trip }, run.status === "error" ? 502 : 200)
  })

  trips.get("/:id/enhancements", async (c) => {
    const result = await loadTrip(c, c.req.param("id"))
    if ("error" in result) return result.error
    return c.json({ runs: await deps.store.listRuns(result.trip.id) })
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
    return c.json({ trip: next, applied, skipped })
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
        photoUrl: photoUrlFor(loc.name),
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
