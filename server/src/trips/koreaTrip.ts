import { koreaSnapshot, type Day, type Reservation } from "../data/koreaSnapshot"
import { koreaPlaces, type PlaceDef } from "../data/koreaPlaces"
import type { ItineraryItem, Trip, TripDay, TripLocation } from "./types"

// ── Korea trip migration ─────────────────────────────────────────────────
//
// Converts the hardcoded Korea snapshot (days, sections, reservations) plus
// the curated POI list into a generic Trip document, so the Korea trip is a
// normal trip in the multi-trip planner. Pure function — no I/O — and fully
// deterministic so the seed is stable across restarts.

export const KOREA_TRIP_ID = "korea-2026"
export const KOREA_TRIP_OWNER = "legacy:korea"

function matchesAlias(place: PlaceDef, text: string): boolean {
  const haystack = text.toLowerCase()
  const candidates = [place.name, ...(place.aliases ?? [])]
  return candidates.some((c) => haystack.includes(c.toLowerCase()))
}

function locationFor(place: PlaceDef): TripLocation {
  return {
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    source: "migration",
    confidence: "high",
  }
}

function reservationItem(r: Reservation): ItineraryItem {
  const fullText = [r.title, r.subtitle ?? "", r.address ?? "", r.notes ?? ""].join(" ")
  const place = koreaPlaces.find((p) => matchesAlias(p, fullText))
  return {
    id: `res-${r.id}`,
    kind: "reservation",
    title: r.title,
    time: r.time,
    notes: [r.subtitle, r.notes].filter(Boolean).join(" — ") || undefined,
    links: r.url ? [r.url] : undefined,
    status: r.status === "confirmed" ? "booked" : r.status === "pending" ? "needs_review" : "optional",
    location: place
      ? locationFor(place)
      : r.address
        ? { name: r.title, address: r.address, source: "migration", confidence: "medium" }
        : undefined,
    reservation: {
      type: r.type,
      status: r.status,
      contact: r.contact,
      url: r.url,
    },
    createdBy: "migration",
  }
}

function buildDay(day: Day, reservations: Reservation[]): TripDay {
  const items: ItineraryItem[] = []
  const placedIds = new Set<string>()

  // 1. Reservations for the day (from the trip-wide list).
  for (const r of reservations) {
    const item = reservationItem(r)
    items.push(item)
    const place = koreaPlaces.find((p) => item.location && p.name === item.location.name)
    if (place) placedIds.add(place.id)
  }

  // 2. Tonight's hotel as a booked place (if not already a reservation).
  const hotel = koreaPlaces.find((p) => p.category === "hotel" && matchesAlias(p, day.hotel))
  if (hotel && !placedIds.has(hotel.id)) {
    placedIds.add(hotel.id)
    items.push({
      id: `hotel-${day.slug}`,
      kind: "place",
      title: `Stay: ${hotel.name}`,
      status: "booked",
      location: locationFor(hotel),
      createdBy: "migration",
    })
  }

  // 3. Sections become section items, preserving bullets as markdown notes;
  //    places mentioned inside bullets become structured place items so they
  //    keep showing up in Map Mode.
  for (const [i, section] of day.sections.entries()) {
    items.push({
      id: `sec-${day.slug}-${i + 1}`,
      kind: "section",
      title: section.heading,
      time: section.time?.match(/^\d{2}:\d{2}/)?.[0],
      notes: section.bullets.map((b) => `- ${b}`).join("\n"),
      status: "none",
      createdBy: "migration",
    })
    for (const bullet of section.bullets) {
      for (const place of koreaPlaces) {
        if (placedIds.has(place.id) || place.category === "hotel") continue
        if (matchesAlias(place, bullet)) {
          placedIds.add(place.id)
          items.push({
            id: `pl-${day.slug}-${place.id}`,
            kind: "place",
            title: place.name,
            notes: place.description,
            status: "none",
            location: locationFor(place),
            createdBy: "migration",
          })
        }
      }
    }
  }

  return {
    id: day.slug,
    date: day.date,
    title: day.title,
    emoji: day.emoji,
    city: day.city,
    notes: day.theme,
    neighborhoods: day.neighborhoods.length ? day.neighborhoods : undefined,
    weather: day.weather,
    // Callouts stay structured (icon + tone + body) so the dossier-style
    // alert boxes render exactly as on /korea.
    callouts: day.callouts?.length ? day.callouts.map((c) => ({ ...c })) : undefined,
    items,
  }
}

export function buildKoreaTrip(now: Date = new Date()): Trip {
  const { trip, days, reservations, neighborhoods } = koreaSnapshot
  const today = now.toISOString().slice(0, 10)
  const status: Trip["status"] =
    today < trip.startDate ? "active" : today > trip.endDate ? "completed" : "active"

  return {
    id: KOREA_TRIP_ID,
    slug: KOREA_TRIP_ID,
    ownerId: KOREA_TRIP_OWNER,
    name: trip.title,
    destinations: [...new Set(days.map((d) => d.city))],
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: "Asia/Seoul",
    status,
    tags: ["migrated"],
    description: [
      trip.anchor,
      `Flights: ${trip.flights.out} / ${trip.flights.back} (${trip.flights.confirmation})`,
      neighborhoods.length
        ? `Neighborhoods: ${neighborhoods.map((n) => `${n.name} (${n.days})`).join(", ")}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
    collaborators: [],
    sharedWithAllUsers: true,
    appearance: {
      accent: "rose",
      eyebrow: "The dossier",
      subtitle: "a Seoul & Busan dossier",
      headline: koreaSnapshot.status.headline,
      cityTags: { Seoul: "SE", Busan: "BU", Yangju: "YJ", Incheon: "IC" },
    },
    days: days.map((day) =>
      buildDay(
        day,
        reservations.filter((r) => r.dayNumber === day.n),
      ),
    ),
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
  }
}
