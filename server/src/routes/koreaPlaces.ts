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
  const themeText = day.theme + " " + day.callouts?.map((c) => c.body).join(" ")
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

  void themeText
  return out
}

places.get("/day/:slug/places", (c) => {
  const slug = c.req.param("slug")
  const testMode = (c.req.query("test") || c.req.query("testMode")) === "sf"
  const userLatStr = c.req.query("lat")
  const userLngStr = c.req.query("lng")
  const userLat = userLatStr ? parseFloat(userLatStr) : undefined
  const userLng = userLngStr ? parseFloat(userLngStr) : undefined

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
    })
  }

  const day = koreaSnapshot.days.find((d) => d.slug === slug || String(d.n) === slug)
  if (!day) return c.json({ error: "Day not found" }, 404)

  const ranked = rankDayPlaces(slug)
  return c.json({
    meta: {
      slug,
      testMode: false,
      city: day.city,
      day: { n: day.n, title: day.title, hotel: day.hotel },
    },
    places: enrichWithDistance(ranked, userLat, userLng).slice(0, 25),
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

export default places
