import { describe, expect, it } from "bun:test"
import {
  categoryFor,
  defaultAnchor,
  hoursOn,
  isOpenAt,
  normaliseTime,
  runFindPlaces,
  runGetDirections,
  runProposeChanges,
  sameVenue,
  summariseTransitSteps,
  toCardPlace,
  walkEstimate,
  zonedToUtc,
  type ConciergeToolContext,
  type RawPlace,
} from "./conciergeTools"
import type { Trip } from "./types"

function makeTrip(): Trip {
  return {
    id: "lisbon",
    ownerId: "u1",
    name: "Lisbon",
    destinations: ["Lisbon"],
    startDate: "2026-11-13",
    endDate: "2026-11-14",
    timezone: "Europe/Lisbon",
    status: "active",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "day-1",
        date: "2026-11-13", // Friday
        city: "Lisbon",
        items: [
          { id: "maat", kind: "place", title: "MAAT", time: "15:00", status: "none", createdBy: "user", location: { name: "MAAT", source: "user", lat: 38.6958, lng: -9.1946 } },
          { id: "ramiro", kind: "reservation", title: "Dinner", time: "20:30", status: "booked", createdBy: "user", location: { name: "Cervejaria Ramiro", source: "user", lat: 38.7203, lng: -9.1356, placeId: "ChIJramiro000" } },
        ],
      },
      { id: "day-2", date: "2026-11-14", city: "Lisbon", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

const cafe: RawPlace = {
  id: "ChIJcafe0001",
  displayName: { text: "Café Central" },
  shortFormattedAddress: "Rua A 1, Lisboa",
  location: { latitude: 38.6962, longitude: -9.1951 },
  rating: 4.6,
  userRatingCount: 320,
  priceLevel: "PRICE_LEVEL_MODERATE",
  primaryType: "coffee_shop",
  googleMapsUri: "https://maps.google.com/?cid=1&g_mp=tracking",
  regularOpeningHours: {
    periods: [
      { open: { day: 5, hour: 8, minute: 0 }, close: { day: 5, hour: 17, minute: 0 } },
      { open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
    ],
  },
}

function makeCtx(over: Partial<ConciergeToolContext> = {}): ConciergeToolContext {
  return { trip: makeTrip(), clock: "16:00", places: new Map(), found: [], routeLinks: [], ...over }
}

describe("small helpers", () => {
  it("normalises clock times and rejects nonsense", () => {
    expect(normaliseTime("8:05")).toBe("08:05")
    expect(normaliseTime("20h30")).toBe("20:30")
    expect(normaliseTime("25:00")).toBeUndefined()
    expect(normaliseTime("soon")).toBeUndefined()
  })

  it("estimates a walk from the straight line plus a street detour", () => {
    const walk = walkEstimate({ lat: 38.6958, lng: -9.1946 }, { lat: 38.6962, lng: -9.1951 })
    expect(walk.meters).toBeGreaterThan(50)
    expect(walk.meters).toBeLessThan(120)
    expect(walk.minutes).toBe(1)
  })

  it("matches a venue under two spellings but not a different one", () => {
    expect(sameVenue("Restaurant - Cervejaria Ramiro", "Cervejaria Ramiro")).toBe(true)
    expect(sameVenue("Pastéis de Belém", "pasteis de belem")).toBe(true)
    expect(sameVenue("Bloco", "Blocos Bar")).toBe(false)
  })

  it("converts a local wall-clock time to the right instant", () => {
    expect(zonedToUtc("2026-07-10", "09:00", "Asia/Tokyo")?.toISOString()).toBe("2026-07-10T00:00:00.000Z")
    expect(zonedToUtc("2026-11-13", "16:30", "Europe/Lisbon")?.toISOString()).toBe("2026-11-13T16:30:00.000Z")
  })
})

describe("opening hours", () => {
  it("reads a weekday's hours and handles spans past midnight", () => {
    expect(hoursOn(cafe, 5)).toBe("08:00–17:00")
    expect(hoursOn(cafe, 1)).toBe("Closed")
    expect(hoursOn({}, 1)).toBeUndefined()
    expect(isOpenAt(cafe, 5, "09:30")).toBe(true)
    expect(isOpenAt(cafe, 5, "17:30")).toBe(false)
    // Saturday 22:00 to Sunday 02:00, asked on Sunday at 01:00.
    expect(isOpenAt(cafe, 0, "01:00")).toBe(true)
    expect(isOpenAt({ regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } }, 3, "04:00")).toBe(true)
    expect(isOpenAt({}, 3, "04:00")).toBeUndefined()
  })

  it("builds the card with the walk, hours and open state for the slot", () => {
    const card = toCardPlace(cafe, { anchor: { name: "MAAT", point: { lat: 38.6958, lng: -9.1946 } }, weekdayIndex: 5, dayId: "day-1", time: "16:30" })
    expect(card).toMatchObject({
      ref: "ChIJcafe0001",
      name: "Café Central",
      category: "cafe",
      price: "€€",
      hours: "08:00–17:00",
      hoursDay: "Fri",
      open: true,
      dayId: "day-1",
      time: "16:30",
      mapsUrl: "https://maps.google.com/?cid=1",
    })
    expect(card?.walk?.from).toBe("MAAT")
    expect(categoryFor({ primaryType: "wine_bar" })).toBe("bar")
    expect(categoryFor({ types: ["art_gallery"] })).toBe("museum")
  })
})

describe("find_places", () => {
  it("searches around the named stop and reports hours, distance and what is already planned", async () => {
    const calls: Array<{ query: string; center?: { lat: number; lng: number } | null }> = []
    const ctx = makeCtx({
      searchPlaces: async (args) => {
        calls.push(args)
        return [cafe, { id: "ChIJramiro000", displayName: { text: "Cervejaria Ramiro" }, location: { latitude: 38.7203, longitude: -9.1356 } }]
      },
    })
    const out = (await runFindPlaces({ query: "coffee", nearItemId: "maat", dayId: "day-1", time: "16:30" }, ctx)) as {
      searchedAround: string
      places: Array<Record<string, string>>
    }
    expect(calls[0]).toMatchObject({ query: "coffee", center: { lat: 38.6958, lng: -9.1946 } })
    expect(out.searchedAround).toBe("MAAT")
    expect(out.places[0]).toMatchObject({ ref: "ChIJcafe0001", hours: "Friday: 08:00–17:00", openAt: "16:30: open" })
    expect(out.places[0]!.distance).toContain("from MAAT")
    expect(out.places[1]!.alreadyOnTrip).toBe("Day 1 at 20:30 (itemId ramiro)")
    expect(ctx.found).toEqual(["ChIJcafe0001", "ChIJramiro000"])
  })

  it("anchors to the shared position, then the stop the plan puts them at", () => {
    const trip = makeTrip()
    const stop = trip.days[0]!.items[0]!
    expect(defaultAnchor(makeCtx({ trip, todayId: "day-1", location: { lat: 1, lng: 2 }, currentStop: stop }))).toEqual({ name: "you", point: { lat: 1, lng: 2 } })
    expect(defaultAnchor(makeCtx({ trip, todayId: "day-1", currentStop: stop }))?.name).toBe("MAAT")
    // Another day: the traveller's position today says nothing about it.
    expect(defaultAnchor(makeCtx({ trip, todayId: "day-1", location: { lat: 1, lng: 2 } }), "day-2")?.name).not.toBe("you")
  })

  it("tells the model when Maps is down instead of throwing", async () => {
    const down = await runFindPlaces({ query: "coffee" }, makeCtx({ searchPlaces: async () => Promise.reject(new Error("503")) }))
    expect(down.error).toContain("did not answer")
    expect((await runFindPlaces({ query: "coffee" }, makeCtx())).error).toContain("unavailable")
  })
})

describe("get_directions", () => {
  it("collapses transit steps into the lines a person follows", () => {
    const steps = summariseTransitSteps(
      [
        { travelMode: "WALK", staticDuration: "200s", distanceMeters: 250 },
        { travelMode: "WALK", staticDuration: "100s", distanceMeters: 120 },
        {
          travelMode: "TRANSIT",
          staticDuration: "840s",
          transitDetails: {
            stopDetails: { departureStop: { name: "Belém" }, arrivalStop: { name: "Cais do Sodré" }, departureTime: "2026-11-13T16:42:00Z" },
            headsign: "Cais do Sodré",
            stopCount: 3,
            transitLine: { nameShort: "15E", vehicle: { name: { text: "Tram" } } },
          },
        },
        { travelMode: "WALK", staticDuration: "30s", distanceMeters: 20 },
      ],
      "Europe/Lisbon",
    )
    expect(steps).toEqual(["Walk 5 min (370 m)", "Tram 15E toward Cais do Sodré: Belém → Cais do Sodré (3 stops, 14 min, departs 16:42)"])
  })

  it("resolves stops by id and returns every mode plus a Maps link", async () => {
    const asked: string[] = []
    const ctx = makeCtx({
      todayId: "day-1",
      routes: async ({ mode, departAt }) => {
        asked.push(`${mode}@${departAt?.toISOString()}`)
        return { mode, minutes: mode === "walk" ? 95 : 21, km: 7.5, ...(mode === "transit" ? { steps: ["Bus 728"] } : {}) }
      },
    })
    const out = await runGetDirections({ from: "maat", to: "ramiro", dayId: "day-1", departTime: "16:30" }, ctx)
    expect(out).toMatchObject({ from: "MAAT", to: "Cervejaria Ramiro", walk: "95 min (7.5 km)", departing: "Friday 16:30" })
    expect(asked).toContain("transit@2026-11-13T16:30:00.000Z")
    expect(ctx.routeLinks?.[0]?.uri).toContain("origin=38.6958,-9.1946")
    expect((await runGetDirections({ from: "maat", to: "nowhere at all" }, ctx)).error).toContain("destination")
  })
})

describe("propose_changes", () => {
  it("resolves a batch against the itinerary and explains what it dropped", async () => {
    const ctx = makeCtx()
    ctx.places.set("ChIJcafe0001", { ref: "ChIJcafe0001", name: "Café Central", lat: 38.6962, lng: -9.1951, dayId: "day-2", time: "09:30" })
    const { proposal, response } = await runProposeChanges(
      {
        summary: "Tidy Friday",
        changes: [
          { op: "set_time", itemId: "ramiro", time: "20:00" },
          { op: "set_time", itemId: "maat", time: "15:00" },
          { op: "move", itemId: "MAAT", toDayId: "day-2", time: "11:00" },
          { op: "remove", itemId: "nope" },
          { op: "add", ref: "ChIJcafe0001", dayId: "day-2" },
          { op: "add", name: "Cervejaria Ramiro", dayId: "day-1" },
          { op: "reorder", dayId: "day-1", order: ["ramiro"] },
          { op: "reorder", dayId: "day-1", order: ["maat", "ramiro"] },
          { op: "teleport", itemId: "maat" },
        ],
      },
      ctx,
    )
    expect(proposal?.summary).toBe("Tidy Friday")
    expect(proposal?.changes.map((c) => c.op)).toEqual(["set_time", "move", "add", "reorder"])
    expect(proposal?.changes[0]).toMatchObject({ itemId: "ramiro", title: "Dinner", from: "20:30", time: "20:00" })
    expect(proposal?.changes[1]).toMatchObject({ itemId: "maat", fromDayId: "day-1", toDayId: "day-2", time: "11:00" })
    // No time on the add: the slot the card suggested for that day is used.
    expect(proposal?.changes[2]).toMatchObject({ op: "add", dayId: "day-2", time: "09:30", place: { name: "Café Central" } })
    expect(proposal?.changes[3]).toMatchObject({ order: ["ramiro", "maat"], titles: ["Dinner", "MAAT"] })
    const rejected = (response.rejected as string[]).join("\n")
    expect(rejected).toContain("MAAT is already at 15:00")
    expect(rejected).toContain("no stop with that itemId")
    expect(rejected).toContain("already on Day 1")
    expect(rejected).toContain("already the order")
    expect(rejected).toContain("unknown op")
    expect(response.shown).toBe(4)
  })

  it("shows no card when nothing survives, and says how to recover", async () => {
    const { proposal, response } = await runProposeChanges({ summary: "x", changes: [{ op: "add", name: "Nowhere Bar", dayId: "day-2" }] }, makeCtx())
    expect(proposal).toBeNull()
    expect(response.shown).toBe(0)
    expect(String(response.note)).toContain("No card was shown")
  })

  it("looks an unknown venue up before adding it, and refuses a different one", async () => {
    const ctx = makeCtx({ searchPlaces: async () => [cafe] })
    const hit = await runProposeChanges({ summary: "Add", changes: [{ op: "add", name: "Cafe Central", dayId: "day-2", time: "9:15" }] }, ctx)
    expect(hit.proposal?.changes[0]).toMatchObject({ op: "add", time: "09:15", place: { placeId: "ChIJcafe0001" } })
    const miss = await runProposeChanges({ summary: "Add", changes: [{ op: "add", name: "Totally Different", dayId: "day-2" }] }, ctx)
    expect(miss.proposal).toBeNull()
  })
})
