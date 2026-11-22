import { describe, expect, test } from "bun:test"
import {
  applySuggestions,
  autoApplyAddSuggestions,
  createGeminiLlm,
  createGroqLlm,
  enhanceTrip,
  fillMissingCoordinates,
  GEMINI_FALLBACK_RESERVE_MS,
  GEMINI_MAX_REQUEST_MS,
  isRetryableReviewError,
  modeTimeoutMs,
  LlmAbortError,
  ReviewAttemptError,
  reviewReplyIsUsable,
  salvageSuggestions,
  withLlmFallback,
  type LlmCall,
} from "./ai"
import { ENHANCEMENT_SYSTEM } from "./prompts"
import type { CompleteEnhancementRun, EnhancementRun, ItineraryItem, Trip } from "./types"

// The AI review as the durable queue runs it: what the model is told, how
// wishlist places are scheduled, and which failures are worth a retry.

const place = (
  id: string,
  name: string,
  extra: Partial<ItineraryItem> & { lat?: number; lng?: number; category?: string } = {},
): ItineraryItem => {
  const { lat, lng, category, ...rest } = extra
  return {
    id,
    kind: "place",
    title: name,
    status: "none",
    location: { name, source: "user", ...(lat != null && lng != null ? { lat, lng } : {}), ...(category ? { category } : {}) },
    createdBy: "user",
    ...rest,
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "user-1",
    name: "Lisbon in spring",
    destinations: ["Lisbon"],
    startDate: "2026-04-10",
    endDate: "2026-04-11",
    timezone: "Europe/Lisbon",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "day-1",
        date: "2026-04-10",
        items: [
          place("it-castle", "Castelo de São Jorge", { lat: 38.7139, lng: -9.1335, time: "10:00", category: "landmark" }),
          place("it-lunch", "Taberna da Rua das Flores", { lat: 38.7105, lng: -9.1435, time: "13:00", category: "restaurant" }),
        ],
      },
      { id: "day-2", date: "2026-04-11", items: [] },
    ],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  }
}

const wishlist = (): ItineraryItem[] => [
  place("idea-pasteis", "Pastéis de Belém", {
    lat: 38.6975,
    lng: -9.2032,
    category: "cafe",
    notes: "Eat them warm at the counter.",
    cost: { amount: 6, currency: "EUR" },
    links: ["https://pasteisdebelem.pt"],
  }),
  place("idea-lx", "LX Factory", { notes: "Sunday market" }),
]

/** A fake model that records what it was asked and answers with `reply`. */
function recordingLlm(reply: unknown = { summary: "Looks good.", suggestions: [] }) {
  const calls: Array<Parameters<LlmCall>[0]> = []
  const llm: LlmCall = async (args) => {
    calls.push(args)
    return typeof reply === "string" ? reply : JSON.stringify(reply)
  }
  return { llm, calls }
}

const addSuggestion = (fields: Record<string, unknown>) => ({
  kind: "add",
  dayId: "day-2",
  title: "Add a stop",
  detail: "Day 2 is empty.",
  confidence: "high",
  ...fields,
})

async function review(trip: Trip, suggestions: unknown[], scope: "trip" | "day" = "trip") {
  const { llm } = recordingLlm({ summary: "Filled day 2.", outcome: "added_places", suggestions })
  const run = await enhanceTrip({ trip, scope, dayId: scope === "day" ? "day-2" : undefined, llm })
  expect(run.status).toBe("complete")
  return run as CompleteEnhancementRun
}

describe("review prompt: the whole trip's context", () => {
  test("carries the description, tags, party, money, to-dos, day notes and bookings", async () => {
    const trip = makeTrip({
      description: "Our anniversary.\nSlow mornings, natural wine, no museums.",
      tags: ["food", "wine"],
      party: [
        { id: "p1", name: "Ana" },
        { id: "p2", name: "Rui" },
      ],
      budget: { currency: "EUR", total: 1500 },
      expenses: [
        { id: "e1", title: "Tram", amount: 12, currency: "EUR", category: "transport", createdAt: "2026-04-10T00:00:00Z" },
      ],
      checklist: [
        { id: "c1", text: "Book Belcanto", done: false, group: "todo", createdAt: "x" },
        { id: "c2", text: "Pack adapters", done: false, group: "packing", createdAt: "x" },
        { id: "c3", text: "Buy Viva Viagem card", done: true, group: "todo", createdAt: "x" },
      ],
    })
    const day = trip.days[0]!
    day.notes = "Alfama by foot, slow lunch."
    day.callouts = [{ icon: "⚠️", tone: "warn", body: "Tram 28 queues from 9 am." }]
    day.journal = "Rained all morning; we hid in a café."
    day.timezone = "Atlantic/Azores"
    day.weather = { highC: 19, lowC: 12, condition: "Showers" }
    day.items[1]!.cost = { amount: 40, currency: "EUR" }
    day.items[1]!.highlight = true
    day.items.push({
      id: "it-dinner",
      kind: "reservation",
      title: "Belcanto",
      time: "20:00",
      status: "booked",
      location: { name: "Belcanto", lat: 38.7101, lng: -9.1421, source: "user", category: "restaurant" },
      reservation: {
        type: "meal",
        status: "confirmed",
        provider: "TheFork",
        confirmation: "SECRET-PNR-42",
        contact: "+351 555 0100",
        seat: "Table 7",
        url: "https://example.com/booking/abc",
      },
      createdBy: "user",
    })
    day.items.push({
      id: "it-flight",
      kind: "reservation",
      title: "Flight home",
      time: "18:30",
      status: "booked",
      reservation: {
        type: "flight",
        status: "confirmed",
        provider: "TAP",
        number: "TP 1350",
        from: "LIS",
        to: "LHR",
        endDate: "2026-04-11",
        endTimezone: "Europe/London",
        terminal: "1",
      },
      createdBy: "user",
    })
    const { llm, calls } = recordingLlm()
    await enhanceTrip({ trip, scope: "trip", llm })
    const user = calls[0]!.user

    expect(user).toContain(`Description: "Our anniversary. Slow mornings, natural wine, no museums."`)
    expect(user).toContain("Tags: food, wine")
    expect(user).toContain("Travelling: 2 people (Ana, Rui)")
    expect(user).toMatch(/budget 1500 EUR for the whole trip; planned stop costs 40 EUR over 1 stop; spent so far 12 EUR/)
    expect(user).toContain("Open to-dos: Book Belcanto")
    expect(user).not.toContain("Pack adapters")
    expect(user).not.toContain("Viva Viagem")
    expect(user).toContain(`theme: "Alfama by foot, slow lunch."`)
    expect(user).toContain(`callout (warn): "Tram 28 queues from 9 am."`)
    expect(user).toContain(`journal: "Rained all morning; we hid in a café."`)
    expect(user).toContain("timezone=Atlantic/Azores")
    expect(user).toContain("saved weather: Showers, 12–19°C")
    expect(user).toMatch(/id=it-lunch kind=place title="Taberna da Rua das Flores" time=13:00 loved .*cost=40 EUR/)
    // Bookings are FIXED, with what matters for timing and nothing private.
    expect(user).toMatch(/id=it-dinner kind=reservation FIXED .*time=20:00 .*booking="meal, confirmed, TheFork"/)
    expect(user).toContain(`booking="flight, confirmed, TAP TP 1350, LIS → LHR, until 2026-04-11 (Europe/London), terminal 1"`)
    expect(user).not.toMatch(/SECRET-PNR-42|555 0100|Table 7|example\.com/)
    // Ordinary stops are not FIXED.
    expect(user).not.toMatch(/id=it-castle kind=place FIXED/)
  })

  test("booking codes and contact details in what the traveller wrote never reach the model", async () => {
    const trip = makeTrip({
      description: "Flights: TP 1350 out, TP 1351 back (QXRT7B). Host: ana@example.pt",
      checklist: [{ id: "c1", text: "Call the hotel on +351 21 123 4567", done: false, group: "todo", createdAt: "x" }],
    })
    trip.days[0]!.items[0]!.notes = "Tickets booked, confirmation 88123456"
    trip.days[0]!.journal = "Booking ref ZK4P2M moved to 11:00"
    const { llm, calls } = recordingLlm()
    await enhanceTrip({ trip, scope: "trip", llm })
    const user = calls[0]!.user
    for (const secret of ["QXRT7B", "ana@example.pt", "123 4567", "88123456", "ZK4P2M"]) expect(user).not.toContain(secret)
    // The parts that help plan the day are still there.
    expect(user).toContain("TP 1350 out, TP 1351 back ([code])")
    expect(user).toContain("Tickets booked, confirmation [code]")
    expect(user).toContain("moved to 11:00")
  })

  test("a day in the trip's own zone does not repeat it; a live forecast replaces the saved weather", async () => {
    const trip = makeTrip()
    trip.days[0]!.timezone = "Europe/Lisbon"
    trip.days[0]!.weather = { highC: 19, lowC: 12, condition: "Showers" }
    const { llm, calls } = recordingLlm()
    await enhanceTrip({
      trip,
      scope: "trip",
      llm,
      fetchWeather: async () => [{ date: "2026-04-10", highC: 22, lowC: 14, precipitationChance: 10 }],
    })
    const user = calls[0]!.user
    expect(user).not.toContain("timezone=Europe/Lisbon")
    expect(user).not.toContain("saved weather")
    expect(user).toContain("2026-04-10: 14–22°C, 10% rain chance")
  })

  test("lists the wishlist with ids, places, coordinates, cost and notes", async () => {
    const trip = makeTrip({ ideas: wishlist() })
    const { llm, calls } = recordingLlm()
    await enhanceTrip({ trip, scope: "trip", llm })
    const user = calls[0]!.user
    expect(user).toContain("Wishlist: places the traveller saved but has not put on any day")
    expect(user).toContain(`"fromIdeaId"`)
    expect(user).toContain(
      `- ideaId=idea-pasteis title="Pastéis de Belém" place=(as title) [cafe] (38.69750,-9.20320) cost=6 EUR notes="Eat them warm at the counter."`,
    )
    expect(user).toContain(`- ideaId=idea-lx title="LX Factory" place=(as title) (no coordinates) notes="Sunday market"`)
  })

  test("leaves out saved places already on a day, and caps a long wishlist", async () => {
    const ideas = [
      place("idea-dup", "Castelo de São Jorge"),
      ...Array.from({ length: 45 }, (_, i) => place(`idea-${i}`, `Saved place ${i}`)),
    ]
    const { llm, calls } = recordingLlm()
    await enhanceTrip({ trip: makeTrip({ ideas }), scope: "trip", llm })
    const user = calls[0]!.user
    expect(user).not.toContain("idea-dup")
    expect(user).toContain("ideaId=idea-39 ")
    expect(user).not.toContain("ideaId=idea-40 ")
    expect(user).toContain("(5 more not shown; 1 already on a day, not shown)")
  })

  test("a single-day review lists the saved places nearest that day first, with the distance", async () => {
    const trip = makeTrip({
      ideas: [
        place("idea-far", "Cabo da Roca", { lat: 38.7804, lng: -9.4989 }),
        place("idea-near", "Miradouro da Graça", { lat: 38.7163, lng: -9.1316 }),
      ],
    })
    const { llm, calls } = recordingLlm()
    await enhanceTrip({ trip, scope: "day", dayId: "day-1", llm })
    const user = calls[0]!.user
    expect(user.indexOf("idea-near")).toBeLessThan(user.indexOf("idea-far"))
    expect(user).toMatch(/ideaId=idea-near .* 0\.\d km from this day's stops/)
  })

  test("the system prompt teaches wishlist-first adds and immovable bookings", () => {
    expect(ENHANCEMENT_SYSTEM).toContain(`"fromIdeaId": string`)
    expect(ENHANCEMENT_SYSTEM).toMatch(/Fill from the wishlist first/)
    expect(ENHANCEMENT_SYSTEM).toMatch(/Add each wishlist place at most once/)
    expect(ENHANCEMENT_SYSTEM).toMatch(/FIXED[^\n]*never move, remove or retime it/)
  })
})

describe("review: wishlist adds", () => {
  test("a wishlist add is filled in from the saved place and keeps its id", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      // Partial on purpose: no title, no location. The idea supplies them.
      addSuggestion({ fromIdeaId: "idea-pasteis", proposedItem: { time: "09:30", notes: "Go before the coach tours." } }),
    ])
    const add = run.suggestions.find((s) => s.kind === "add")!
    expect(add.fromIdeaId).toBe("idea-pasteis")
    expect(add.proposedItem).toMatchObject({
      id: "idea-pasteis",
      kind: "place",
      title: "Pastéis de Belém",
      time: "09:30",
      notes: "Go before the coach tours.",
      links: ["https://pasteisdebelem.pt"],
      cost: { amount: 6, currency: "EUR" },
      createdBy: "ai",
      location: { name: "Pastéis de Belém", lat: 38.6975, lng: -9.2032, source: "user" },
    })
    expect(run.outcome).toBe("added_places")
  })

  test("the saved pin stands even when the model sends other coordinates; notes fall back to the idea's", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({
        fromIdeaId: "idea-pasteis",
        proposedItem: { title: "Pasteis de Belem bakery", location: { name: "Somewhere else", lat: 1, lng: 2, address: "Rua de Belém 84" } },
      }),
    ])
    const item = run.suggestions[0]!.proposedItem!
    expect(item.title).toBe("Pastéis de Belém")
    expect(item.notes).toBe("Eat them warm at the counter.")
    expect(item.location).toMatchObject({ name: "Pastéis de Belém", lat: 38.6975, lng: -9.2032, address: "Rua de Belém 84" })
  })

  test("a saved place without coordinates takes the model's", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({ fromIdeaId: "idea-lx", proposedItem: { time: "11:00", location: { name: "LX Factory", lat: 38.7036, lng: -9.1785 } } }),
    ])
    expect(run.suggestions[0]!.proposedItem!.location).toMatchObject({ name: "LX Factory", lat: 38.7036, lng: -9.1785 })
  })

  test("an unknown wishlist id is dropped, and the add stands on its own", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({
        fromIdeaId: "idea-nope",
        proposedItem: { title: "Time Out Market", location: { name: "Time Out Market", lat: 38.7069, lng: -9.1459 } },
      }),
      // No real idea and no title of its own: nothing to add.
      addSuggestion({ fromIdeaId: "idea-ghost", proposedItem: { time: "15:00" } }),
    ])
    expect(run.suggestions).toHaveLength(1)
    expect(run.suggestions[0]!.fromIdeaId).toBeUndefined()
    expect(run.suggestions[0]!.proposedItem!.title).toBe("Time Out Market")
  })

  test("a wishlist place is used once per review", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({ fromIdeaId: "idea-pasteis", proposedItem: { time: "09:30" } }),
      addSuggestion({ dayId: "day-1", fromIdeaId: "idea-pasteis", proposedItem: { time: "16:00" } }),
    ])
    const adds = run.suggestions.filter((s) => s.kind === "add")
    expect(adds).toHaveLength(1)
    expect(adds[0]!.dayId).toBe("day-2")
  })

  test("a plain add of a saved place becomes a wishlist add instead of a duplicate", async () => {
    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({
        proposedItem: { title: "Pastéis de Belém", time: "09:30", location: { name: "Pastéis de Belém", lat: 38.69, lng: -9.2 } },
      }),
      // The same place again later in the reply: a duplicate.
      addSuggestion({ dayId: "day-1", proposedItem: { title: "Pasteis de Belem", location: { name: "Pastéis de Belém" } } }),
    ])
    const adds = run.suggestions.filter((s) => s.kind === "add")
    expect(adds).toHaveLength(1)
    expect(adds[0]!.fromIdeaId).toBe("idea-pasteis")
    expect(adds[0]!.proposedItem!.location).toMatchObject({ lat: 38.6975, lng: -9.2032 })
  })

  test("a saved place whose venue is already on a day is not added again", async () => {
    const run = await review(makeTrip({ ideas: [place("idea-castle", "Castelo de São Jorge")] }), [
      addSuggestion({ fromIdeaId: "idea-castle", proposedItem: { time: "10:00" } }),
    ])
    expect(run.suggestions.filter((s) => s.kind === "add")).toEqual([])
  })

  test("a near name for a venue already on the trip is not added again", async () => {
    const run = await review(makeTrip(), [
      // "Castelo de São Jorge" is on day 1: the same castle, its kind word dropped.
      addSuggestion({ proposedItem: { title: "São Jorge Castle", location: { name: "Castelo São Jorge", lat: 38.7139, lng: -9.1335 } } }),
      addSuggestion({ proposedItem: { title: "Castelo de Sao Jorge" } }),
      // A different venue next door stays.
      addSuggestion({ proposedItem: { title: "Miradouro de Santa Luzia", location: { name: "Miradouro de Santa Luzia", lat: 38.7118, lng: -9.1302 } } }),
    ])
    expect(run.suggestions.filter((s) => s.kind === "add").map((s) => s.proposedItem!.title)).toEqual(["Miradouro de Santa Luzia"])
  })

  test("a near name of a saved place schedules that idea", async () => {
    const run = await review(makeTrip({ ideas: [place("idea-leeum", "Leeum Museum of Art", { lat: 37.5381, lng: 126.9993 })] }), [
      addSuggestion({ proposedItem: { title: "Leeum Museum", time: "14:00", location: { name: "Leeum Museum", lat: 37.5382, lng: 126.9994 } } }),
    ])
    const adds = run.suggestions.filter((s) => s.kind === "add")
    expect(adds).toHaveLength(1)
    expect(adds[0]!.fromIdeaId).toBe("idea-leeum")
    expect(adds[0]!.proposedItem!.title).toBe("Leeum Museum of Art")
  })

  test("the same name far away is another branch, not a duplicate", async () => {
    const trip = makeTrip()
    trip.days[0]!.items.push(place("it-cafe", "Fábrica Coffee Roasters", { lat: 38.7167, lng: -9.1446 }))
    const run = await review(trip, [
      addSuggestion({ proposedItem: { title: "Fábrica Coffee Roasters", location: { name: "Fábrica Coffee Roasters", lat: 38.6925, lng: -9.2155 } } }),
    ])
    expect(run.suggestions.filter((s) => s.kind === "add")).toHaveLength(1)
  })

  test("a note the model wrote from a placeholder never replaces the traveller's own", async () => {
    const trip = makeTrip({ ideas: [place("idea-lx", "LX Factory", { notes: "Tickets: confirmation 88123456" })] })
    trip.days[0]!.items[1]!.notes = "Booked, call +351 21 123 4567 if late"
    const run = await review(trip, [
      addSuggestion({ fromIdeaId: "idea-lx", proposedItem: { time: "15:00", notes: "Tickets: confirmation [code]" } }),
      {
        kind: "edit",
        dayId: "day-1",
        itemId: "it-lunch",
        title: "Earlier lunch",
        detail: "",
        confidence: "high",
        proposedChanges: { time: "12:30", notes: "Booked, call [number] if late" },
      },
    ])
    const add = run.suggestions.find((s) => s.kind === "add")!
    expect(add.proposedItem!.notes).toBe("Tickets: confirmation 88123456")
    const update = run.suggestions.find((s) => s.kind === "edit")!
    expect(update.proposedChanges).toEqual({ time: "12:30" })
  })

  test("a stray null, an empty string or a link inside the stop never costs the suggestion", () => {
    const parsed = salvageSuggestions(
      JSON.stringify({
        suggestions: [
          { kind: "warning", title: "Check hours", detail: "", fromIdeaId: null },
          { kind: "add", dayId: "day-2", title: "Add", detail: "", fromIdeaId: "", proposedItem: { title: "Café" } },
          { kind: "add", dayId: "day-2", title: "Add", detail: "", proposedItem: { fromIdeaId: "idea-lx", time: "11:00" } },
        ],
      }),
    )
    expect(parsed.dropped).toBe(0)
    expect(parsed.suggestions.map((s) => s.fromIdeaId)).toEqual([undefined, undefined, "idea-lx"])
  })

  test("blanks in a wishlist add are gaps the saved place fills, not a malformed stop", async () => {
    const blanks = [
      null,
      { title: "", time: "11:00" },
      { title: null, time: "11:00" },
      { time: "11:00", location: null },
      { time: "11:00", location: {} },
      { time: "11:00", location: { lat: 1, lng: 2 } },
      { time: null, notes: "  " },
    ]
    const parsed = salvageSuggestions(
      JSON.stringify({ suggestions: blanks.map((proposedItem) => addSuggestion({ fromIdeaId: "idea-lx", proposedItem })) }),
    )
    expect(parsed.dropped).toBe(0)
    expect(parsed.suggestions).toHaveLength(blanks.length)

    const run = await review(makeTrip({ ideas: wishlist() }), [
      addSuggestion({ fromIdeaId: "idea-lx", proposedItem: { title: null, time: "11:00", location: null } }),
    ])
    expect(run.suggestions[0]!.proposedItem).toMatchObject({
      id: "idea-lx",
      title: "LX Factory",
      time: "11:00",
      notes: "Sunday market",
      location: { name: "LX Factory" },
    })
  })

  test("a plain add without a title is still refused", () => {
    const parsed = salvageSuggestions(
      JSON.stringify({ suggestions: [{ kind: "add", dayId: "day-2", title: "Add", detail: "", proposedItem: { time: "11:00" } }] }),
    )
    expect(parsed.suggestions).toEqual([])
    expect(parsed.dropped).toBe(1)
  })
})

describe("applying wishlist adds", () => {
  const scheduled = (trip: Trip, ideaId = "idea-pasteis"): EnhancementRun => {
    const idea = trip.ideas!.find((i) => i.id === ideaId)!
    return {
      id: "run-1",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      outcome: "added_places",
      outcomeReason: "Filled day 2.",
      appliedSuggestionIds: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      suggestions: [
        {
          id: "sug-idea",
          kind: "add",
          dayId: "day-2",
          title: "Add Pastéis de Belém",
          detail: "",
          confidence: "high",
          fromIdeaId: ideaId,
          proposedItem: { ...structuredClone(idea), time: "09:30", status: "needs_review", createdBy: "ai" },
        },
      ],
    }
  }

  test("applySuggestions puts the place on the day and takes it off the wishlist in one change", () => {
    const trip = makeTrip({ ideas: wishlist() })
    const { trip: next, applied } = applySuggestions(trip, scheduled(trip), ["sug-idea"])
    expect(applied).toEqual(["sug-idea"])
    expect(next.days[1]!.items.map((i) => i.id)).toEqual(["idea-pasteis"])
    expect(next.ideas!.map((i) => i.id)).toEqual(["idea-lx"])
    // The trip it was given is untouched.
    expect(trip.ideas).toHaveLength(2)
    expect(trip.days[1]!.items).toEqual([])
  })

  test("autoApplyAddSuggestions takes the idea off the wishlist too", () => {
    const trip = makeTrip({ ideas: wishlist() })
    const result = autoApplyAddSuggestions(trip, scheduled(trip))
    expect(result.applied).toEqual(["sug-idea"])
    expect(result.trip.ideas!.map((i) => i.id)).toEqual(["idea-lx"])
    expect(result.trip.days[1]!.items[0]!.title).toBe("Pastéis de Belém")
    expect(result.run.outcome).toBe("added_places")
  })

  test("an idea removed meanwhile still lands as a stop", () => {
    const trip = makeTrip({ ideas: wishlist() })
    const run = scheduled(trip)
    const without = { ...trip, ideas: trip.ideas!.filter((i) => i.id !== "idea-pasteis") }
    const { trip: next, applied } = applySuggestions(without, run, ["sug-idea"])
    expect(applied).toEqual(["sug-idea"])
    expect(next.days[1]!.items.map((i) => i.title)).toEqual(["Pastéis de Belém"])
    expect(next.ideas!.map((i) => i.id)).toEqual(["idea-lx"])
  })

  test("an idea the traveller scheduled meanwhile is not added twice", () => {
    const trip = makeTrip({ ideas: wishlist() })
    const run = scheduled(trip)
    // The client's "Add to day" moves the idea itself, id included.
    const moved: Trip = {
      ...trip,
      ideas: trip.ideas!.filter((i) => i.id !== "idea-pasteis"),
      days: [trip.days[0]!, { ...trip.days[1]!, items: [trip.ideas![0]!] }],
    }
    expect(applySuggestions(moved, run, ["sug-idea"]).skipped).toEqual(["sug-idea"])
    // Or the same venue under another id.
    const again: Trip = {
      ...trip,
      days: [{ ...trip.days[0]!, items: [...trip.days[0]!.items, place("it-mine", "Pastéis de Belém")] }, trip.days[1]!],
    }
    const out = applySuggestions(again, run, ["sug-idea"])
    expect(out.skipped).toEqual(["sug-idea"])
    expect(out.trip.ideas).toHaveLength(2)
  })

  test("an add whose venue the traveller put on a day meanwhile, under a near name, is skipped", () => {
    const trip = makeTrip()
    const run: EnhancementRun = {
      id: "run-2",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      outcome: "added_places",
      outcomeReason: "Filled day 2.",
      appliedSuggestionIds: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      suggestions: [
        {
          id: "sug-lx",
          kind: "add",
          dayId: "day-2",
          title: "Add LX Factory",
          detail: "",
          confidence: "high",
          proposedItem: { ...place("it-ai-lx", "LX Factory"), status: "needs_review", createdBy: "ai" },
        },
      ],
    }
    const mine: Trip = { ...trip, days: [trip.days[0]!, { ...trip.days[1]!, items: [place("it-mine", "LX Factory Market")] }] }
    const out = applySuggestions(mine, run, ["sug-lx"])
    expect(out.skipped).toEqual(["sug-lx"])
    expect(out.trip.days[1]!.items.map((i) => i.id)).toEqual(["it-mine"])
  })

  test("a trip without a wishlist does not grow an empty one", () => {
    const trip = makeTrip()
    const run: EnhancementRun = {
      ...scheduled(makeTrip({ ideas: wishlist() })),
      suggestions: [
        {
          id: "sug-plain",
          kind: "add",
          dayId: "day-2",
          title: "Add lunch",
          detail: "",
          confidence: "high",
          proposedItem: place("it-new", "Cervejaria Ramiro", { lat: 38.7206, lng: -9.1357 }),
        },
      ],
    }
    const { trip: next } = applySuggestions(trip, run, ["sug-plain"])
    expect("ideas" in next).toBe(false)
  })
})

describe("deadline: each try's share of it", () => {
  test("with no deadline, every try gets the fixed per-request timeout", () => {
    expect(modeTimeoutMs({ first: true, perRequestMs: 150_000 })).toBe(150_000)
    expect(modeTimeoutMs({ first: false, perRequestMs: 150_000 })).toBe(150_000)
  })

  test("the first try gets all but the fallback's reserve, up to the cap", () => {
    const now = 1_000_000
    expect(modeTimeoutMs({ first: true, perRequestMs: 150_000, deadlineAt: now + 240_000, now })).toBe(
      Math.min(240_000 - GEMINI_FALLBACK_RESERVE_MS, GEMINI_MAX_REQUEST_MS),
    )
    expect(modeTimeoutMs({ first: true, perRequestMs: 150_000, deadlineAt: now + 600_000, now })).toBe(GEMINI_MAX_REQUEST_MS)
  })

  test("later tries get what is left, never less than a second", () => {
    const now = 1_000_000
    expect(modeTimeoutMs({ first: false, perRequestMs: 150_000, deadlineAt: now + 25_000, now })).toBe(25_000)
    expect(modeTimeoutMs({ first: true, perRequestMs: 150_000, deadlineAt: now + 10_000, now })).toBe(1_000)
  })

  test("enhanceTrip hands the deadline to the model", async () => {
    let seen: number | undefined
    const llm: LlmCall = async (args) => {
      seen = args.deadlineAt
      return JSON.stringify({ summary: "Fine as is.", outcome: "no_adds_needed", outcomeReason: "Well paced.", suggestions: [] })
    }
    const trip = {
      id: "t", ownerId: "u", name: "T", destinations: ["Seoul"], startDate: "2026-12-05", endDate: "2026-12-05",
      timezone: "Asia/Seoul", status: "draft", tags: [], collaborators: [], createdAt: "", updatedAt: "",
      days: [{ id: "day-1", date: "2026-12-05", items: [] }],
    } as unknown as Trip
    await enhanceTrip({ trip, scope: "trip", llm, deadlineAt: 123 })
    expect(seen).toBe(123)
  })
})

describe("deadline: the caller's signal", () => {
  const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 })

  test("an abort mid-request stops the Gemini ladder without stepping down", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        calls++
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
        queueMicrotask(() => controller.abort(new Error("attempt deadline")))
      })) as typeof fetch
    const err = await createGeminiLlm("k", fetchImpl)({ system: "s", user: "u", signal: controller.signal }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmAbortError)
    expect((err as Error).name).toBe("AbortError")
    expect((err as Error).message).toBe("The AI took too long to answer.")
    expect(((err as Error).cause as Error).message).toBe("attempt deadline")
    expect(calls).toBe(1)
  })

  test("one request timing out, with budget left, still steps down to the next mode", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) throw new DOMException("The operation timed out.", "TimeoutError")
      return ok()
    }) as typeof fetch
    const text = await createGeminiLlm("k", fetchImpl)({ system: "s", user: "u", signal: controller.signal })
    expect(text).toBe("{}")
    expect(calls).toBe(2)
  })

  test("an aborted signal sends no request at all", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return ok()
    }) as typeof fetch
    const err = await createGeminiLlm("k", fetchImpl)({ system: "s", user: "u", signal: AbortSignal.abort() }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmAbortError)
    expect(calls).toBe(0)
  })

  test("the 429 wait is cut short", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      controller.abort()
      return new Response("quota", { status: 429, headers: { "retry-after": "4" } })
    }) as typeof fetch
    const started = Date.now()
    const err = await createGeminiLlm("k", fetchImpl)({ system: "s", user: "u", signal: controller.signal }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmAbortError)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(calls).toBe(1)
  })

  test("each request gets its own signal that follows the caller's", async () => {
    const controller = new AbortController()
    let seen: AbortSignal | null | undefined
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.signal
      return ok()
    }) as typeof fetch
    await createGeminiLlm("k", fetchImpl)({ system: "s", user: "u", signal: controller.signal })
    expect(seen).toBeInstanceOf(AbortSignal)
    expect(seen).not.toBe(controller.signal)
    expect(seen!.aborted).toBe(false)
    controller.abort()
    expect(seen!.aborted).toBe(true)
  })

  test("a prompt the safety filter blocked does not step down the ladder", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })
    }) as typeof fetch
    await expect(createGeminiLlm("k", fetchImpl)({ system: "s", user: "u" })).rejects.toThrow(/gemini blocked: SAFETY/)
    expect(calls).toBe(1)
  })

  test("Groq sends nothing once the signal has aborted", async () => {
    const err = await createGroqLlm("k")({ system: "s", user: "u", signal: AbortSignal.abort() }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmAbortError)
  })

  test("withLlmFallback does not fall back after the caller aborted", async () => {
    const controller = new AbortController()
    let fallbackCalls = 0
    const llm = withLlmFallback(
      async () => {
        controller.abort()
        throw new LlmAbortError()
      },
      async () => {
        fallbackCalls++
        return "fallback"
      },
    )
    await expect(llm({ system: "s", user: "u", signal: controller.signal })).rejects.toBeInstanceOf(LlmAbortError)
    expect(fallbackCalls).toBe(0)
  })

  test("enhanceTrip hands the signal to the model, the forecast and the geocoder", async () => {
    const controller = new AbortController()
    const seen: Record<string, AbortSignal | undefined> = {}
    await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      signal: controller.signal,
      llm: async (args) => {
        seen.llm = args.signal
        return JSON.stringify({
          summary: "Lunch on day 2.",
          suggestions: [addSuggestion({ proposedItem: { title: "Cervejaria Ramiro", location: { name: "Cervejaria Ramiro" } } })],
        })
      },
      fetchWeather: async (args) => {
        seen.weather = args.signal
        return []
      },
      geocode: async (_query, opts) => {
        seen.geocode = opts?.signal
        return { lat: 38.7206, lng: -9.1357 }
      },
    })
    expect(seen.llm).toBe(controller.signal)
    expect(seen.weather).toBe(controller.signal)
    // Geocoding has its own budget inside the caller's.
    expect(seen.geocode).toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(seen.geocode!.aborted).toBe(true)
  })

  test("a deadline that passes while the model answers throws a retryable timeout", async () => {
    const controller = new AbortController()
    const err = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      signal: controller.signal,
      // A model that ignores the signal and answers late.
      llm: async () => {
        controller.abort()
        return JSON.stringify({ summary: "ok", suggestions: [] })
      },
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReviewAttemptError)
    expect(isRetryableReviewError(err)).toBe(true)
    expect((err as Error).message).toMatch(/took too long/i)
  })

  test("fillMissingCoordinates stops on abort, and a late answer changes nothing", async () => {
    const controller = new AbortController()
    let answer!: (hit: { lat: number; lng: number }) => void
    const item = place("it-x", "Somewhere")
    const pass = fillMissingCoordinates(
      [item],
      () => new Promise((resolve) => (answer = resolve)),
      "Lisbon",
      controller.signal,
    )
    controller.abort()
    await pass
    answer({ lat: 1, lng: 2 })
    await Promise.resolve()
    expect(item.location!.lat).toBeUndefined()
  })
})

describe("retryable or final", () => {
  const attempt = (llm: LlmCall, extra: Partial<Parameters<typeof enhanceTrip>[0]> = {}) =>
    enhanceTrip({ trip: makeTrip(), scope: "trip", llm, ...extra }).then(
      (run) => ({ run }),
      (err: unknown) => ({ err }),
    )
  const failing = (message: string): LlmCall => async () => {
    throw new Error(message)
  }

  test.each([
    ["a transport error", failing("fetch failed"), /did not finish/],
    ["a 5xx", failing("gemini 503: overloaded"), /did not finish/],
    ["a quota", failing("gemini 429: exhausted"), /busy/],
    ["a timeout", (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError")
    }) as LlmCall, /took too long/],
    ["an empty response", failing("gemini returned an empty response (MAX_TOKENS)"), /did not finish/],
    ["an empty reply", (async () => "") as LlmCall, /could not use/],
    ["an empty object", (async () => "{}") as LlmCall, /could not use/],
    ["only malformed suggestions", (async () =>
      JSON.stringify({ summary: "Added lunch.", suggestions: [{ kind: "add" }, { title: "no kind" }] })) as LlmCall, /could not use/],
  ])("%s is thrown as retryable", async (_name, llm, message) => {
    const { err } = (await attempt(llm)) as { err?: unknown }
    expect(err).toBeInstanceOf(ReviewAttemptError)
    expect(isRetryableReviewError(err)).toBe(true)
    expect((err as Error).message).toMatch(message)
    expect((err as Error).message).not.toMatch(/gemini|fetch failed|MAX_TOKENS/)
  })

  test("a prompt blocked by safety returns a failed run", async () => {
    const { run } = (await attempt(failing("gemini blocked: SAFETY"))) as { run?: EnhancementRun }
    expect(run?.status).toBe("error")
    expect(run?.status === "error" && run.error).toMatch(/declined to review/)
    expect(run?.status === "error" && run.error).not.toMatch(/gemini|SAFETY/)
  })

  test("a prompt too long for the only model returns a failed run", async () => {
    const { run } = (await attempt(failing("groq prompt exceeds on-demand token budget"))) as { run?: EnhancementRun }
    expect(run?.status).toBe("error")
    expect(run?.status === "error" && run.error).toMatch(/one day at a time/)
  })

  test("a missing day returns a failed run without asking the model", async () => {
    const { llm, calls } = recordingLlm()
    const { run } = (await attempt(llm, { scope: "day", dayId: "day-9" })) as { run?: EnhancementRun }
    expect(run?.status).toBe("error")
    expect(calls).toHaveLength(0)
  })

  test("a reply with only a summary is a complete review", async () => {
    const { run } = (await attempt(async () => JSON.stringify({ summary: "Nicely paced." }))) as { run?: EnhancementRun }
    expect(run?.status).toBe("complete")
  })

  test("a forecast that fails does not fail the review", async () => {
    const { run } = (await attempt(recordingLlm().llm, {
      fetchWeather: async () => {
        throw new Error("open-meteo down")
      },
    })) as { run?: EnhancementRun }
    expect(run?.status).toBe("complete")
  })

  test("isRetryableReviewError", () => {
    expect(isRetryableReviewError(new ReviewAttemptError("x", { retryable: true }))).toBe(true)
    expect(isRetryableReviewError(new ReviewAttemptError("x", { retryable: false }))).toBe(false)
    expect(isRetryableReviewError(new LlmAbortError())).toBe(true)
    expect(isRetryableReviewError(new DOMException("timed out", "TimeoutError"))).toBe(true)
    expect(isRetryableReviewError(new Error("gemini 500: boom"))).toBe(true)
    expect(isRetryableReviewError(new Error("store write failed"))).toBe(true)
    expect(isRetryableReviewError("a string")).toBe(true)
    expect(isRetryableReviewError(new Error("gemini blocked: SAFETY"))).toBe(false)
    expect(isRetryableReviewError(new Error("groq prompt exceeds on-demand token budget"))).toBe(false)
  })

  test("reviewReplyIsUsable", () => {
    const usable = (reply: unknown) => reviewReplyIsUsable(salvageSuggestions(JSON.stringify(reply)))
    expect(usable({ summary: "Fine as it is." })).toBe(true)
    expect(usable({ outcome: "no_adds_needed" })).toBe(true)
    expect(usable({ suggestions: [{ kind: "info", title: "Nice", detail: "" }] })).toBe(true)
    expect(usable({ summary: "ok", suggestions: [{ kind: "info", title: "Nice" }, { kind: "bogus" }] })).toBe(true)
    expect(usable({})).toBe(false)
    expect(usable({ suggestions: [] })).toBe(false)
    expect(usable({ summary: "  " })).toBe(false)
    expect(usable({ summary: "Added lunch.", outcome: "added_places", suggestions: [{ kind: "bogus" }] })).toBe(false)
  })
})
