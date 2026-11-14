import { describe, expect, test } from "bun:test"
import { extractModelJson, generateItinerary, type LlmCall } from "./ai"
import { repairTruncatedJson } from "./jsonRepair"
import { baseByDay, baseDistances, describeBases, isFixed, isLodging, lodgingSignature } from "./lodging"
import type { ItineraryItem, Trip } from "./types"

const place = (title: string, time: string, lat = 21.28, lng = -157.83, category = "landmark") => ({
  kind: "place",
  title,
  time,
  notes: "n",
  location: { name: title, address: "a", lat, lng, category },
})
const dayJson = (n: number, stops = 3) => ({
  title: `Day ${n}`,
  city: "Honolulu",
  items: Array.from({ length: stops }, (_, i) => place(`Stop ${n}-${i + 1}`, `${String(9 + i * 2).padStart(2, "0")}:00`)),
})

function trip(days: number, items: Record<number, ItineraryItem[]> = {}): Trip {
  const start = new Date("2027-02-01T00:00:00Z")
  const iso = (i: number) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
  return {
    id: "t",
    ownerId: "u",
    name: "O'ahu",
    destinations: ["Honolulu"],
    startDate: iso(0),
    endDate: iso(days - 1),
    timezone: "Pacific/Honolulu",
    status: "draft",
    tags: [],
    collaborators: [],
    days: Array.from({ length: days }, (_, i) => ({ id: `day-${i + 1}`, date: iso(i), items: items[i + 1] ?? [] })),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as Trip
}

const hotel = (id: string, name: string, lat: number, lng: number): ItineraryItem =>
  ({ id, kind: "place", title: name, status: "none", createdBy: "user", location: { name, lat, lng, category: "hotel", source: "user" } }) as ItineraryItem

describe("repairTruncatedJson", () => {
  test("closes a document cut off inside an array and keeps every complete element", () => {
    const full = JSON.stringify({ summary: "s", days: [dayJson(1), dayJson(2), dayJson(3)] })
    const cut = full.slice(0, full.indexOf("Stop 3-2") + 4)
    expect(() => JSON.parse(cut)).toThrow()
    const repaired = JSON.parse(repairTruncatedJson(cut)!) as { summary: string; days: Array<{ items: unknown[] }> }
    expect(repaired.summary).toBe("s")
    expect(repaired.days).toHaveLength(3)
    expect(repaired.days[1]!.items).toHaveLength(3)
    expect(repaired.days[2]!.items).toHaveLength(1)
  })

  test("is not fooled by brackets and quotes inside strings", () => {
    const cut = '{"days":[{"title":"A ] } \\" tricky","items":[{"title":"ok"}]},{"title":"half'
    expect(JSON.parse(repairTruncatedJson(cut)!)).toEqual({ days: [{ title: 'A ] } " tricky', items: [{ title: "ok" }] }] })
  })

  test("returns complete documents untouched and gives up when nothing is whole", () => {
    expect(repairTruncatedJson('noise {"a":[1,2]} trailing')).toBe('{"a":[1,2]}')
    expect(repairTruncatedJson('{"summary":"only a str')).toBeNull()
    expect(repairTruncatedJson("no json here")).toBeNull()
  })

  test("extractModelJson recovers a cut-off answer instead of throwing a parse error", () => {
    const full = JSON.stringify({ summary: "s", days: [dayJson(1), dayJson(2)] })
    const parsed = extractModelJson(full.slice(0, full.length - 30)) as { days: unknown[] }
    expect(parsed.days.length).toBeGreaterThanOrEqual(1)
  })
})

describe("lodging", () => {
  const t = trip(4, {
    2: [hotel("h1", "Waikiki Hotel", 21.2766, -157.8278), { id: "a", kind: "place", title: "North Shore", status: "none", createdBy: "ai", location: { name: "Haleiwa", lat: 21.5928, lng: -158.1034, source: "ai" } } as ItineraryItem],
    4: [hotel("h2", "Ko Olina Resort", 21.3393, -158.1245)],
  })

  test("a hotel covers its day and the days after, and the days before the first one", () => {
    const bases = baseByDay(t)
    expect(bases.get("day-1")!.name).toBe("Waikiki Hotel")
    expect(bases.get("day-3")!.name).toBe("Waikiki Hotel")
    expect(bases.get("day-4")!.name).toBe("Ko Olina Resort")
  })

  test("measures a day against its base and flags the far ones for the reviewer", () => {
    const d = baseDistances(t.days[1]!, baseByDay(t).get("day-2"))!
    expect(d.firstKm).toBeGreaterThan(40)
    const text = describeBases(t)
    expect(text).toContain('sleeping at "Waikiki Hotel"')
    expect(text).toContain("FAR START")
  })

  test("recognises lodging bookings, fixed commitments and a change of hotel", () => {
    const booking = { id: "r", kind: "reservation", title: "Check in", status: "booked", createdBy: "user", reservation: { type: "hotel", status: "confirmed" } } as ItineraryItem
    expect(isLodging(booking)).toBe(true)
    expect(isFixed(booking)).toBe(true)
    expect(isFixed({ id: "p", kind: "place", title: "Beach", status: "none", createdBy: "ai" } as ItineraryItem)).toBe(false)
    const moved = trip(4, { 2: [hotel("h1", "Kailua Inn", 21.4022, -157.7394)] })
    expect(lodgingSignature(moved)).not.toBe(lodgingSignature(t))
    expect(lodgingSignature(trip(4))).toBe("")
  })
})

describe("generateItinerary robustness", () => {
  test("a short trip survives an answer cut off mid-JSON", async () => {
    const full = JSON.stringify({ summary: "ok", days: [dayJson(1), dayJson(2), dayJson(3)] })
    const llm: LlmCall = async () => full.slice(0, full.indexOf("Stop 3-3"))
    const out = await generateItinerary({ trip: trip(3), llm })
    expect(out.days.map((d) => d.items.length)).toEqual([3, 3, 2])
    expect(out.incompleteDays).toEqual([])
  })

  test("a long trip is outlined, then drafted three days at a time", async () => {
    const calls: string[] = []
    const llm: LlmCall = async ({ system, user }) => {
      if (system.includes("settle the shape of the whole trip")) {
        calls.push("outline")
        return JSON.stringify({ summary: "shape", days: Array.from({ length: 7 }, (_, i) => ({ title: `Area ${i + 1}`, focus: "f" })) })
      }
      const range = user.match(/draft only days? (\d+)(?: to (\d+))?/)!
      const from = Number(range[1])
      const to = Number(range[2] ?? range[1])
      calls.push(`days ${from}-${to}`)
      return JSON.stringify({ days: Array.from({ length: to - from + 1 }, (_, k) => dayJson(from + k)) })
    }
    const out = await generateItinerary({ trip: trip(7), llm })
    expect(calls[0]).toBe("outline")
    expect(calls.slice(1).sort()).toEqual(["days 1-3", "days 4-6", "days 7-7"])
    expect(out.summary).toBe("shape")
    expect(out.days).toHaveLength(7)
    expect(out.days.every((d) => d.items.length === 3)).toBe(true)
    expect(out.days[6]!.items[0]!.title).toBe("Stop 7-1")
    expect(out.incompleteDays).toEqual([])
  })

  test("one failing part is retried, then reported, without losing the rest", async () => {
    let attempts = 0
    const llm: LlmCall = async ({ system, user }) => {
      if (system.includes("settle the shape")) return JSON.stringify({ days: Array.from({ length: 6 }, (_, i) => ({ title: `Area ${i + 1}` })) })
      if (user.includes("draft only days 4 to 6")) {
        attempts++
        throw new Error("gemini 503")
      }
      return JSON.stringify({ days: [dayJson(1), dayJson(2), dayJson(3)] })
    }
    const out = await generateItinerary({ trip: trip(6), llm })
    expect(attempts).toBe(2)
    expect(out.days.slice(0, 3).every((d) => d.items.length === 3)).toBe(true)
    expect(out.days[3]!.title).toBe("Area 4")
    expect(out.incompleteDays).toEqual([4, 5, 6])
  })

  test("a redraft keeps the hotel and bookings, tells the model, and drops duplicates", async () => {
    const booked = { id: "b1", kind: "reservation", title: "Luau", time: "17:30", status: "booked", createdBy: "user", reservation: { type: "experience", status: "confirmed" } } as ItineraryItem
    const t = trip(2, { 1: [hotel("h1", "Waikiki Hotel", 21.2766, -157.8278)], 2: [booked] })
    let seen = ""
    const llm: LlmCall = async ({ user }) => {
      seen = user
      return JSON.stringify({ days: [{ ...dayJson(1), items: [...dayJson(1).items, place("Waikiki Hotel", "15:00")] }, dayJson(2)] })
    }
    const out = await generateItinerary({ trip: t, llm })
    expect(seen).toContain("Where they sleep")
    expect(seen).toContain('"Waikiki Hotel"')
    expect(seen).toContain('17:30 "Luau"')
    expect(out.days[0]!.items.filter((i) => i.title === "Waikiki Hotel").map((i) => i.id)).toEqual(["h1"])
    const day2 = out.days[1]!.items.map((i) => i.title)
    expect(day2).toContain("Luau")
    expect(day2.indexOf("Luau")).toBe(day2.length - 1) // 17:30 lands after the 13:00 stop
  })

  test("the same venue drafted on two days is kept on the earlier one", async () => {
    const llm: LlmCall = async ({ system, user }) => {
      if (system.includes("settle the shape")) return JSON.stringify({ days: [] })
      const from = Number(user.match(/draft only days? (\d+)/)![1])
      return JSON.stringify({ days: [0, 1, 2].map((k) => ({ ...dayJson(from + k), items: [...dayJson(from + k).items, place("Diamond Head", "16:00")] })) })
    }
    const out = await generateItinerary({ trip: trip(6), llm })
    expect(out.days.flatMap((d) => d.items).filter((i) => i.title === "Diamond Head")).toHaveLength(1)
  })
})

describe("moving stops between days and swapping days", () => {
  const stop = (id: string, title: string, time?: string): ItineraryItem => ({ id, kind: "place", title, time, status: "none", createdBy: "ai" }) as ItineraryItem
  const base = () => {
    const t = trip(3, {
      1: [stop("a", "A", "09:00"), stop("b", "B", "15:00")],
      2: [stop("c", "C", "10:00"), stop("d", "D", "18:00")],
    })
    t.days[0]!.title = "Town"
    t.days[1]!.title = "North Shore"
    return t
  }
  const run = (suggestions: Array<Record<string, unknown>>) =>
    ({ id: "r", tripId: "t", scope: "trip", status: "complete", appliedSuggestionIds: [], createdAt: "", suggestions }) as never

  test("a move takes its new time and lands in clock order on the other day", async () => {
    const { applySuggestions } = await import("./ai")
    const out = applySuggestions(base(), run([{ id: "m", kind: "move", itemId: "b", toDayId: "day-2", title: "Move B", detail: "", confidence: "high", proposedChanges: { time: "13:00" } }]), ["m"])
    expect(out.applied).toEqual(["m"])
    expect(out.trip.days[0]!.items.map((i) => i.id)).toEqual(["a"])
    expect(out.trip.days[1]!.items.map((i) => `${i.id}@${i.time}`)).toEqual(["c@10:00", "b@13:00", "d@18:00"])
  })

  test("a swap trades the plans and keeps the dates", async () => {
    const { applySuggestions } = await import("./ai")
    const before = base()
    const out = applySuggestions(before, run([{ id: "s", kind: "swap_days", dayId: "day-1", toDayId: "day-2", title: "Swap", detail: "", confidence: "high" }]), ["s"])
    expect(out.trip.days[0]!.date).toBe(before.days[0]!.date)
    expect(out.trip.days[0]!.title).toBe("North Shore")
    expect(out.trip.days[0]!.items.map((i) => i.id)).toEqual(["c", "d"])
    expect(out.trip.days[1]!.title).toBe("Town")
  })

  test("a move to a day that does not exist is skipped, not applied", async () => {
    const { applySuggestions } = await import("./ai")
    const out = applySuggestions(base(), run([{ id: "m", kind: "move", itemId: "b", toDayId: "day-9", title: "x", detail: "", confidence: "low" }]), ["m"])
    expect(out.skipped).toEqual(["m"])
  })

  test("listing suffixes are stripped from stop titles", async () => {
    const { normalizeAiItem } = await import("./ai")
    expect((normalizeAiItem({ kind: "place", title: "Mei Sum | Chinese Dim Sum" }) as { title: string }).title).toBe("Mei Sum")
  })
})
