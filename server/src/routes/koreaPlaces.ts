import { Hono } from "hono"
import {
  koreaPlaces,
  categoryIcon,
  categoryColor,
  haversineMeters,
  formatDistance,
  type PlaceDef,
  type PlaceCategory,
} from "../data/koreaPlaces"
import { sfTestPlaces } from "../data/sfTestPlaces"
import { koreaSnapshot } from "../data/koreaSnapshot"
import { verifyClerkOptional } from "../middleware/clerkAuth"
import { listIgPlacesForDay } from "../igPlaces/wire"
import { config } from "../config"

const places = new Hono()

export type PlacePriority = "scheduled" | "core" | "supplemental"

interface RankedPlace {
  id: string
  name: string
  category: PlaceCategory
  icon: string
  color: string
  lat: number
  lng: number
  city: string
  address?: string
  description: string
  photoUrl: string
  openingHours?: string
  notice?: string
  priority: PlacePriority
  reason: string // why this place was surfaced
  reservationId?: string
  reservationTime?: string
  distanceMeters?: number
  distanceLabel?: string
  subcategory?: "instagram"
  instagramUrl?: string
  instagramShortcode?: string
}

// IG place_category → PlaceCategory mapping
const IG_CATEGORY_MAP: Record<string, PlaceCategory> = {
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  shopping: "shopping",
  activity: "experience",
  hotel: "hotel",
  landmark: "landmark",
  other: "landmark",
}

export interface IgSave {
  id: number
  name: string
  name_romanized?: string | null
  category: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  confidence_band: "high" | "medium" | "low"
  instagramUrl: string
  instagramShortcode?: string | null
  ownerUsername?: string | null
  captionSnippet?: string | null
}

function photoUrlFor(query: string): string {
  // Unsplash Source returns a 1200x800 cropped image matching the query. No
  // API key required. We add a deterministic seed (the lowercased + hyphenated
  // query) so re-renders of the same place return the same photo.
  const seed = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)
  return `https://source.unsplash.com/featured/1200x800/?${encodeURIComponent(query)}&sig=${seed}`
}

function buildRanked(
  place: PlaceDef,
  priority: PlacePriority,
  reason: string,
  reservationMeta?: { id?: string; time?: string },
): RankedPlace {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    icon: categoryIcon[place.category],
    color: categoryColor[place.category],
    lat: place.lat,
    lng: place.lng,
    city: place.city,
    address: place.address,
    description: place.description,
    photoUrl: photoUrlFor(place.photoQuery),
    openingHours: place.openingHours,
    notice: place.notice,
    priority,
    reason,
    reservationId: reservationMeta?.id,
    reservationTime: reservationMeta?.time,
  }
}

function matchesAlias(place: PlaceDef, text: string): boolean {
  const haystack = text.toLowerCase()
  const candidates = [place.name, ...(place.aliases ?? [])]
  return candidates.some((c) => haystack.includes(c.toLowerCase()))
}

function rankDayPlaces(slug: string): RankedPlace[] {
  const day = koreaSnapshot.days.find((d) => d.slug === slug || String(d.n) === slug)
  if (!day) return []

  const seen = new Set<string>()
  const out: RankedPlace[] = []

  const push = (p: RankedPlace) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push(p)
  }

  // 1. Reservations on this day → "scheduled"
  const reservations = koreaSnapshot.reservations.filter((r) => r.dayNumber === day.n)
  for (const r of reservations) {
    const fullText = [r.title, r.subtitle ?? "", r.address ?? "", r.notes ?? ""].join(" ")
    for (const place of koreaPlaces) {
      if (matchesAlias(place, fullText)) {
        push(
          buildRanked(place, "scheduled", `Reservation: ${r.title}`, {
            id: r.id,
            time: r.time,
          }),
        )
      }
    }
  }

  // 2. Hotel of the day → scheduled if not already counted
  for (const place of koreaPlaces) {
    if (place.category === "hotel" && matchesAlias(place, day.hotel)) {
      push(buildRanked(place, "scheduled", `Tonight's stay: ${day.hotel}`))
    }
  }

  // 3. Day-card neighborhoods → "core"
  for (const n of day.neighborhoods) {
    for (const place of koreaPlaces) {
      if (matchesAlias(place, n) && place.category === "neighborhood") {
        push(buildRanked(place, "core", `Neighborhood: ${n}`))
      }
    }
  }

  // 4. Scan section bullets and theme text for any matched place → "core" if
  //    the place appears in a bullet, otherwise "supplemental".
  const sectionText = day.sections.flatMap((s) => [s.heading, ...s.bullets]).join(" \n ")
  const bulletHits = new Map<string, string>()

  for (const place of koreaPlaces) {
    if (seen.has(place.id)) continue
    if (matchesAlias(place, sectionText)) {
      const bullet =
        day.sections
          .flatMap((s) => s.bullets)
          .find((b) => matchesAlias(place, b)) ?? ""
      bulletHits.set(place.id, bullet)
    }
  }

  for (const [pid, bullet] of bulletHits) {
    const place = koreaPlaces.find((p) => p.id === pid)
    if (!place) continue
    push(
      buildRanked(
        place,
        "core",
        bullet ? `Mentioned: "${bullet.slice(0, 80)}${bullet.length > 80 ? "…" : ""}"` : "Mentioned today",
      ),
    )
  }

  // 5. Same-city extras → "supplemental"
  for (const place of koreaPlaces) {
    if (seen.has(place.id)) continue
    if (place.city === day.city || (day.city === "Seoul" && place.city === "Seoul")) {
      // Skip hotels for OTHER days; only the current day's hotel is interesting
      if (place.category === "hotel") continue
      push(buildRanked(place, "supplemental", `Nearby in ${place.city}`))
    }
    if (out.length > 30) break
  }

  return out
}

places.get("/day/:slug/places", async (c) => {
  const slug = c.req.param("slug")
  const testMode = (c.req.query("test") || c.req.query("testMode")) === "sf"
  const userLatStr = c.req.query("lat")
  const userLngStr = c.req.query("lng")
  const userLat = userLatStr ? parseFloat(userLatStr) : undefined
  const userLng = userLngStr ? parseFloat(userLngStr) : undefined

  // Optional auth — doesn't reject unauthenticated requests but enables
  // user-specific IG saves when a valid Clerk JWT is provided.
  const userId = await verifyClerkOptional(c.req.header("Authorization"), {
    secretKey: config.clerkSecretKey,
    devBearer: config.igDevBearer,
    devUserId: config.igDevUserId,
  })

  if (testMode) {
    // SF synthetic day — treat first place as scheduled, next 4 as core, rest supplemental.
    const ranked: RankedPlace[] = sfTestPlaces.map((place, i) => {
      const priority: PlacePriority = i === 0 ? "scheduled" : i < 5 ? "core" : "supplemental"
      const reason =
        i === 0 ? "Test 'scheduled' anchor" : i < 5 ? "Test core pick" : "Test supplemental pick"
      return buildRanked(place, priority, reason)
    })
    return c.json({
      meta: {
        slug,
        testMode: true,
        city: "San Francisco",
        center: { lat: 37.7926, lng: -122.4101, label: "Fairmont San Francisco (test anchor)" },
      },
      places: enrichWithDistance(ranked, userLat, userLng).slice(0, 25),
      igSaves: [] as IgSave[],
    })
  }

  const day = koreaSnapshot.days.find((d) => d.slug === slug || String(d.n) === slug)
  if (!day) return c.json({ error: "Day not found" }, 404)

  const ranked = rankDayPlaces(slug)
  // Look up the day's hotel coordinates so the client can anchor
  // Map Mode at the correct base camp for the day (Grand
  // InterContinental Parnas days 1-2, Park Hyatt Seoul 3-8, Signiel
  // Busan 9+). Without this the scene always centers on the
  // hardcoded mock-hotel — wrong for any day where the hotel isn't
  // Park Hyatt Seoul.
  const hotelPlace = koreaPlaces.find(
    (p) => p.category === "hotel" && matchesAlias(p, day.hotel),
  )
  const center = hotelPlace
    ? { lat: hotelPlace.lat, lng: hotelPlace.lng, label: hotelPlace.name }
    : undefined

  // Fetch IG-assigned places for this day when the user is authenticated.
  let igSaves: IgSave[] = []
  let igRankedPlaces: RankedPlace[] = []
  if (userId) {
    try {
      const igPlaces = await listIgPlacesForDay({ userId, dayN: day.n })
      igSaves = igPlaces.map((p) => ({
        id: p.id,
        name: p.name,
        name_romanized: p.name_romanized,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        confidence_band: p.confidence_band,
        instagramUrl: p.post.url,
        instagramShortcode: p.post.shortcode,
        ownerUsername: p.post.owner_username,
        captionSnippet: p.post.caption ? p.post.caption.slice(0, 200) : null,
      }))

      // Build RankedPlace entries for IG places that have coordinates
      igRankedPlaces = igPlaces
        .filter((p) => p.lat != null && p.lng != null)
        .map((p): RankedPlace => {
          const mappedCategory = (IG_CATEGORY_MAP[p.category] ?? "landmark") as PlaceCategory
          return {
            id: `ig-${p.id}`,
            name: p.name,
            category: mappedCategory,
            icon: categoryIcon[mappedCategory],
            color: categoryColor[mappedCategory],
            lat: p.lat as number,
            lng: p.lng as number,
            city: day.city,
            address: p.address ?? undefined,
            description: p.post.caption ? p.post.caption.slice(0, 200) : `Saved from Instagram`,
            photoUrl: `https://source.unsplash.com/featured/1200x800/?${encodeURIComponent(p.name)}&sig=${p.id}`,
            priority: "scheduled",
            reason: `Saved from Instagram${p.post.owner_username ? ` (@${p.post.owner_username})` : ""}`,
            subcategory: "instagram",
            instagramUrl: p.post.url,
            instagramShortcode: p.post.shortcode ?? undefined,
          }
        })
    } catch (err) {
      // Non-fatal: log and continue with no IG saves
      console.warn("[korea/places] failed to load IG saves:", err)
    }
  }

  // Merge IG places into ranked list (IG places first as they are 'scheduled')
  const allRanked = [...igRankedPlaces, ...ranked]

  return c.json({
    meta: {
      slug,
      testMode: false,
      city: day.city,
      day: { n: day.n, title: day.title, hotel: day.hotel },
      center,
    },
    places: enrichWithDistance(allRanked, userLat, userLng).slice(0, 30),
    igSaves,
  })
})

function enrichWithDistance(
  ranked: RankedPlace[],
  userLat: number | undefined,
  userLng: number | undefined,
): RankedPlace[] {
  if (typeof userLat !== "number" || typeof userLng !== "number") return ranked
  return ranked
    .map((p) => {
      const d = haversineMeters({ lat: userLat, lng: userLng }, { lat: p.lat, lng: p.lng })
      return { ...p, distanceMeters: d, distanceLabel: formatDistance(d) }
    })
    .sort((a, b) => {
      // Priority first (scheduled > core > supplemental), then distance.
      const rank = (p: RankedPlace) =>
        p.priority === "scheduled" ? 0 : p.priority === "core" ? 1 : 2
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
    })
}

// ── GET /api/korea/entities ────────────────────────────────────────────
//
// Aggregates EVERY named thing in the trip into one flat dictionary,
// so the frontend can match these substrings inline (across themes,
// bullets, notes, callouts) and wrap each match in <SmartEntity>.
//
// Sources:
//   1. koreaPlaces — 50 hand-curated POIs with category + aliases.
//      Covers palaces, restaurants, cafés, shopping, markets, etc.
//   2. snapshot.trip.hotels — base camps. May overlap with koreaPlaces
//      but we dedupe by lowercased name.
//   3. snapshot.neighborhoods — district names with their day ranges.
//   4. snapshot.days[].city — city tags (Seoul, Busan, Yangju, Incheon).
//   5. snapshot.reservations — booked items (flights, meals, events).
//
// Returned dictionary is read-mostly: the frontend fetches once per
// session and matches substrings client-side via a regex built from
// all names + aliases.

type EntityType =
  | "flight"
  | "hotel"
  | "restaurant"
  | "cafe"
  | "bar"
  | "city"
  | "neighborhood"
  | "palace"
  | "museum"
  | "shrine"
  | "market"
  | "shopping"
  | "park"
  | "viewpoint"
  | "experience"
  | "venue"
  | "station"
  | "transit"
  | "airport"
  | "place"
  | "person"

interface EntityRef {
  name: string
  type: EntityType
  city?: string
  aliases?: string[]
}

const PLACE_CATEGORY_TO_ENTITY: Record<PlaceCategory, EntityType> = {
  hotel: "hotel",
  palace: "palace",
  museum: "museum",
  shrine: "shrine",
  market: "market",
  shopping: "shopping",
  cafe: "cafe",
  restaurant: "restaurant",
  bar: "bar",
  park: "park",
  viewpoint: "viewpoint",
  experience: "experience",
  transit: "transit",
  neighborhood: "neighborhood",
  venue: "venue",
}

const RESERVATION_TYPE_TO_ENTITY: Record<string, EntityType> = {
  flight: "flight",
  hotel: "hotel",
  meal: "restaurant",
  bar: "bar",
  experience: "experience",
  transit: "transit",
  event: "experience",
  appointment: "place",
  wedding: "venue",
}

places.get("/entities", (c) => {
  // Build the dictionary. Last writer wins on name conflict — koreaPlaces
  // entries have the richest data (category + aliases + city) so they go
  // first; snapshot-only entries (hotels, neighborhoods, reservations)
  // fill in only if there's no koreaPlaces match.
  const byKey = new Map<string, EntityRef>()
  const put = (entity: EntityRef) => {
    const key = entity.name.trim().toLowerCase()
    if (!key) return
    if (byKey.has(key)) return
    byKey.set(key, entity)
  }

  // 1. koreaPlaces
  for (const p of koreaPlaces) {
    put({
      name: p.name,
      type: PLACE_CATEGORY_TO_ENTITY[p.category] ?? "place",
      city: p.city !== "Other" ? p.city : undefined,
      aliases: p.aliases,
    })
  }

  // 2. Hotels from the trip metadata
  for (const h of koreaSnapshot.trip.hotels) {
    put({ name: h.name, type: "hotel" })
  }

  // 3. Neighborhoods
  for (const n of koreaSnapshot.neighborhoods) {
    put({ name: n.name, type: "neighborhood" })
  }

  // 4. Cities (one entry per unique city across all days)
  const cities = new Set<string>()
  for (const day of koreaSnapshot.days) {
    if (day.city) cities.add(day.city)
    for (const nb of day.neighborhoods ?? []) put({ name: nb, type: "neighborhood", city: day.city })
  }
  for (const c2 of cities) {
    put({ name: c2, type: "city" })
  }

  // 5. Reservations — useful for things mentioned by name elsewhere
  // (e.g. a meal at "Cornerstone" referenced in a bullet on the day
  // before the reservation).
  for (const r of koreaSnapshot.reservations) {
    const type = RESERVATION_TYPE_TO_ENTITY[r.type] ?? "place"
    const day = koreaSnapshot.days.find((d) => d.n === r.dayNumber)
    put({ name: r.title, type, city: day?.city })
  }

  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400")
  return c.json(Array.from(byKey.values()))
})

export default places
