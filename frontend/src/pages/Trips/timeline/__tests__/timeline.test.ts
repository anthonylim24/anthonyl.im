import { describe, expect, it } from "vitest"
import { dayPins, TO_SCHEDULE } from "../../map/geo"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem } from "../../__tests__/tripFixtures"
import { clockLabel, clockMinutes, clockRange, layoutDay, legEstimate, stopNumbers, stopTitle, timeScale, typicalMinutes, yAt } from "../timeline"

const at = (h: number, m = 0) => h * 60 + m

/** About 1.1 km per 0.01° of latitude. */
const SEOUL = { lat: 37.57, lng: 126.98 }
const north = (km: number) => ({ lat: SEOUL.lat + km / 111.195, lng: SEOUL.lng })

function stop(id: string, time: string | undefined, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return makeItem({ id, title: id, time, ...overrides })
}

function pinned(id: string, time: string | undefined, point: { lat: number; lng: number }, overrides: Partial<ItineraryItem> = {}) {
  return stop(id, time, { location: { name: id, lat: point.lat, lng: point.lng, source: "user" }, ...overrides })
}

function day(items: ItineraryItem[]): TripDay {
  return { id: "d1", date: "2026-06-01", items }
}

const block = (layout: ReturnType<typeof layoutDay>, id: string) => layout.blocks.find((b) => b.itemId === id)!

describe("clock helpers", () => {
  it("reads only real clock times", () => {
    expect(clockMinutes("09:30")).toBe(at(9, 30))
    expect(clockMinutes("9:05")).toBe(at(9, 5))
    expect(clockMinutes("24:00")).toBeNull()
    expect(clockMinutes("10:75")).toBeNull()
    expect(clockMinutes("noon")).toBeNull()
    expect(clockMinutes(undefined)).toBeNull()
  })

  it("labels past midnight as the next morning", () => {
    expect(clockLabel(at(13, 5))).toBe("1:05 PM")
    expect(clockLabel(at(25, 30))).toBe("1:30 AM")
  })
})

describe("typicalMinutes", () => {
  it("knows how long things usually take", () => {
    expect(typicalMinutes(stop("f", "08:00", { kind: "reservation", reservation: { type: "flight", status: "confirmed" } }))).toBe(180)
    expect(typicalMinutes(stop("h", "15:00", { kind: "reservation", reservation: { type: "hotel", status: "confirmed" } }))).toBe(30)
    expect(typicalMinutes(stop("m", "12:00", { kind: "reservation", reservation: { type: "meal", status: "confirmed" } }))).toBe(75)
    expect(typicalMinutes(stop("c", "09:00", { location: { name: "c", category: "Cafe", source: "user" } }))).toBe(45)
    expect(typicalMinutes(stop("b", "21:00", { location: { name: "b", category: "bar", source: "user" } }))).toBe(90)
    expect(typicalMinutes(stop("p", "10:00", { location: { name: "p", category: "palace", source: "user" } }))).toBe(120)
    expect(typicalMinutes(stop("g", "16:00", { location: { name: "g", category: "garden", source: "user" } }))).toBe(90)
    expect(typicalMinutes(stop("s", "17:00", { location: { name: "s", category: "market", source: "user" } }))).toBe(60)
    expect(typicalMinutes(stop("x", "17:00"))).toBe(60)
  })

  it("falls back to the place's category when the booking type says nothing", () => {
    const tickets = stop("t", "10:00", {
      kind: "reservation",
      reservation: { type: "experience", status: "confirmed" },
      location: { name: "t", category: "museum", source: "user" },
    })
    expect(typicalMinutes(tickets)).toBe(120)
  })
})

describe("layoutDay", () => {
  it("uses the end time when there is one, and guesses otherwise", () => {
    const layout = layoutDay(
      day([
        stop("flight", "06:00", { kind: "reservation", reservation: { type: "flight", status: "confirmed" } }),
        stop("lunch", "12:00", { endTime: "13:30" }),
        stop("walk", "16:00"),
      ]),
    )
    expect(block(layout, "flight")).toMatchObject({ start: at(6), end: at(9), estimated: true })
    expect(block(layout, "lunch")).toMatchObject({ start: at(12), end: at(13, 30), estimated: false })
    expect(block(layout, "walk")).toMatchObject({ start: at(16), end: at(17), estimated: true })
  })

  it("treats an end time equal to the start as no end time", () => {
    const layout = layoutDay(day([stop("a", "10:00", { endTime: "10:00" })]))
    expect(block(layout, "a")).toMatchObject({ end: at(11), estimated: true })
  })

  it("runs an end time earlier than the start past midnight", () => {
    const layout = layoutDay(day([stop("bar", "22:00", { endTime: "02:00" })]))
    expect(block(layout, "bar")).toMatchObject({ start: at(22), end: at(26), estimated: false })
    expect(layout.end).toBeGreaterThanOrEqual(at(26))
    expect(layout.end - layout.start).toBeGreaterThanOrEqual(180)
  })

  it("stops the ruler at 06:00 the next morning for a stay that runs on", () => {
    const layout = layoutDay(day([stop("hotel", "15:00", { endTime: "11:00" })]))
    expect(block(layout, "hotel").end).toBe(at(35))
    expect(layout.end).toBe(at(30))
  })

  it("starts the ruler at the first stop's hour and gives a short day three hours", () => {
    const layout = layoutDay(day([stop("a", "10:20")]))
    expect(layout).toMatchObject({ start: at(10), end: at(13) })
  })

  it("covers a long day without padding", () => {
    const layout = layoutDay(day([stop("a", "07:45"), stop("b", "21:10", { endTime: "22:20" })]))
    expect(layout).toMatchObject({ start: at(7), end: at(23) })
  })

  it("puts overlapping stops side by side, and only the cluster shares lanes", () => {
    const layout = layoutDay(
      day([
        stop("a", "10:00", { endTime: "12:00" }),
        stop("b", "11:00", { endTime: "11:30" }),
        stop("c", "11:15", { endTime: "13:00" }),
        stop("d", "14:00", { endTime: "15:00" }),
      ]),
    )
    expect(layout.blocks.map(({ itemId, lane, lanes }) => [itemId, lane, lanes])).toEqual([
      ["a", 0, 3],
      ["b", 1, 3],
      ["c", 2, 3],
      ["d", 0, 1],
    ])
    expect(layout.conflicts.filter((c) => c.kind === "overlap").map((c) => c.ids)).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ])
    expect(layout.conflicts[0]!.detail).toBe("Overlaps a")
    expect(layout.gaps).toEqual([{ from: at(13), to: at(14), afterId: "c", beforeId: "d", free: 60 }])
  })

  it("reuses a lane once it frees up", () => {
    const layout = layoutDay(
      day([stop("a", "10:00", { endTime: "11:00" }), stop("b", "10:30", { endTime: "12:00" }), stop("c", "11:00", { endTime: "11:30" })]),
    )
    expect(layout.blocks.map((b) => [b.itemId, b.lane, b.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 2],
    ])
  })
  it("flags two stops at the same minute even when neither has an end time", () => {
    const layout = layoutDay(day([stop("a", "10:00"), stop("b", "10:00")]))
    expect(layout.blocks.map((b) => b.lanes)).toEqual([2, 2])
    expect(layout.conflicts).toEqual([{ ids: ["a", "b"], kind: "overlap", detail: "Overlaps a" }])
  })

  it("lets a guessed length give way to the next stop, leaving time to get there", () => {
    const layout = layoutDay(
      day([
        pinned("coffee", "10:00", SEOUL, { location: { name: "coffee", lat: SEOUL.lat, lng: SEOUL.lng, category: "cafe", source: "user" } }),
        pinned("palace", "10:30", north(2)),
      ]),
    )
    // 2 km is ≈ 15 min by transit, so coffee ends 10:15 rather than its usual 10:45.
    expect(block(layout, "coffee")).toMatchObject({ end: at(10, 15), estimated: true })
    expect(layout.gaps).toHaveLength(1)
    expect(layout.gaps[0]).toMatchObject({ from: at(10, 15), to: at(10, 30), free: 0, travel: { mode: "transit", minutes: 15 } })
    expect(layout.conflicts).toEqual([])
  })

  it("keeps a short stay before giving way, and calls a leg that doesn't fit tight", () => {
    const layout = layoutDay(day([pinned("lunch", "12:00", SEOUL), pinned("museum", "12:30", north(10))]))
    expect(block(layout, "lunch")).toMatchObject({ end: at(12, 15), estimated: true })
    expect(layout.conflicts).toEqual([
      { ids: ["lunch", "museum"], kind: "tight", detail: "Tight · ≈ 35 min by transit, 15 min gap" },
    ])
  })

  it("calls a leg tight against a real end time, and says when there's no gap at all", () => {
    const layout = layoutDay(
      day([pinned("lunch", "12:00", SEOUL, { endTime: "13:00" }), pinned("museum", "13:00", north(0.8))]),
    )
    expect(layout.conflicts).toEqual([{ ids: ["lunch", "museum"], kind: "tight", detail: "Tight · 10 min walk, no gap" }])
  })

  it("counts free time after the travel, and leaves unpinned gaps without a leg", () => {
    const layout = layoutDay(
      day([
        pinned("a", "09:00", SEOUL, { endTime: "10:00" }),
        pinned("b", "12:00", north(0.5), { endTime: "13:00" }),
        stop("c", "15:00", { endTime: "16:00" }),
      ]),
    )
    expect(layout.gaps).toEqual([
      { from: at(10), to: at(12), afterId: "a", beforeId: "b", travel: { mode: "walk", minutes: 6, label: "6 min walk" }, free: 114 },
      { from: at(13), to: at(15), afterId: "b", beforeId: "c", free: 120 },
    ])
  })

  it("measures the leg to a train but not out of it: it arrives somewhere else", () => {
    const train = { kind: "reservation" as const, reservation: { type: "transit", status: "confirmed" as const } }
    const layout = layoutDay(
      day([
        pinned("lunch", "12:00", north(3), { endTime: "13:00" }),
        pinned("ktx", "14:00", SEOUL, { ...train, endTime: "16:40" }),
        pinned("busan", "17:00", { lat: 35.18, lng: 129.08 }),
      ]),
    )
    expect(layout.gaps.map((g) => [g.afterId, g.travel?.mode])).toEqual([
      ["lunch", "transit"],
      ["ktx", undefined],
    ])
    expect(layout.conflicts).toEqual([])
  })

  it("draws no leg between two stops at the same spot", () => {
    const layout = layoutDay(day([pinned("a", "09:00", SEOUL, { endTime: "10:00" }), pinned("b", "11:00", { lat: SEOUL.lat + 0.0001, lng: SEOUL.lng })]))
    expect(layout.gaps[0]!.travel).toBeUndefined()
    expect(layout.gaps[0]!.free).toBe(60)
  })

  it("measures the leg from whichever stop finishes last", () => {
    const layout = layoutDay(
      day([
        pinned("long", "09:00", SEOUL, { endTime: "12:00" }),
        pinned("short", "10:00", north(30), { endTime: "10:30" }),
        pinned("next", "13:00", north(0.5)),
      ]),
    )
    expect(layout.gaps).toEqual([expect.objectContaining({ afterId: "long", beforeId: "next", from: at(12), to: at(13) })])
    expect(layout.conflicts.map((c) => c.kind)).toEqual(["overlap"])
  })

  it("keeps untimed stops and everything to schedule off the clock, in order", () => {
    const layout = layoutDay(
      day([
        stop("timed", "09:00"),
        stop("someday", undefined),
        stop("bad", "25:00"),
        stop("memo", "10:00", { kind: "note" }),
        stop("heading", "11:00", { kind: "section" }),
        stop("parking", undefined, { kind: "section", title: TO_SCHEDULE }),
        stop("parked", "14:00"),
        stop("parkedNote", undefined, { kind: "note" }),
      ]),
    )
    expect(layout.blocks.map((b) => b.itemId)).toEqual(["timed"])
    expect(layout.untimed).toEqual(["someday", "bad", "parked"])
  })

  it("sorts the clock by time, keeping itinerary order for ties", () => {
    const layout = layoutDay(day([stop("late", "18:00"), stop("early", "08:00", { endTime: "09:00" }), stop("tie", "08:00", { endTime: "08:30" })]))
    expect(layout.blocks.map((b) => b.itemId)).toEqual(["early", "tie", "late"])
  })

  it("returns an empty clock for a day with nothing timed", () => {
    const layout = layoutDay(day([stop("someday", undefined)]))
    expect(layout).toMatchObject({ blocks: [], gaps: [], conflicts: [], untimed: ["someday"] })
    expect(layout.end - layout.start).toBe(360)
  })
})

describe("stopNumbers", () => {
  it("matches the day map's pin labels, untimed stops included and parked ones left out", () => {
    const d = day([
      pinned("b", "11:00", north(1)),
      stop("unpinned", "09:00"),
      pinned("a", undefined, SEOUL),
      pinned("c", "08:00", north(2)),
      stop("parking", undefined, { kind: "section", title: TO_SCHEDULE }),
      pinned("parked", undefined, north(3)),
    ])
    const numbers = stopNumbers(d)
    expect(Object.fromEntries(numbers)).toEqual({ b: 1, a: 2, c: 3 })
    for (const pin of dayPins(d).filter((p) => p.variant === "stop")) expect(String(numbers.get(pin.id))).toBe(pin.label)
  })
})

describe("legEstimate", () => {
  const train = { kind: "reservation" as const, reservation: { type: "Transit", status: "confirmed" as const } }

  it("estimates the leg between two pinned stops", () => {
    expect(legEstimate(pinned("a", undefined, SEOUL), pinned("b", undefined, north(10)))).toMatchObject({ mode: "transit", minutes: 35 })
  })

  it("has no leg out of a train or flight, a same-spot hop, or an unpinned stop", () => {
    expect(legEstimate(pinned("ktx", undefined, SEOUL, train), pinned("b", undefined, north(300)))).toBeUndefined()
    expect(legEstimate(pinned("a", undefined, north(3)), pinned("ktx", undefined, SEOUL, train))).toMatchObject({ mode: "transit" })
    expect(legEstimate(pinned("a", undefined, SEOUL), pinned("b", undefined, { lat: SEOUL.lat + 0.0002, lng: SEOUL.lng }))).toBeUndefined()
    expect(legEstimate(stop("a", undefined), pinned("b", undefined, SEOUL))).toBeUndefined()
  })
})

describe("stopTitle", () => {
  it("falls back to the place name, then to a placeholder, even with no title stored", () => {
    expect(stopTitle({ title: "  ", location: { name: "Gwangjang Market", source: "user" } })).toBe("Gwangjang Market")
    expect(stopTitle({ title: undefined as unknown as string })).toBe("Untitled stop")
  })
})

describe("timeScale", () => {
  it("is linear when nothing needs more room", () => {
    const scale = timeScale(at(9), at(15), 1.2, [{ from: at(10), to: at(11), px: 44 }])
    expect(scale.height).toBeCloseTo(360 * 1.2)
    expect(yAt(scale, at(10))).toBeCloseTo(72)
    expect(yAt(scale, at(12, 30))).toBeCloseTo(210 * 1.2)
  })

  it("stretches a short stop to its minimum and pushes the rest of the day down", () => {
    const scale = timeScale(at(9), at(15), 1.2, [{ from: at(10), to: at(10, 15), px: 44 }])
    expect(yAt(scale, at(10, 15)) - yAt(scale, at(10))).toBeCloseTo(44)
    expect(scale.height).toBeCloseTo(360 * 1.2 + (44 - 18))
    // Halfway through the stop is halfway down its block.
    expect(yAt(scale, at(10, 7.5))).toBeCloseTo(72 + 22)
  })

  it("clamps spans and lookups to the window", () => {
    const scale = timeScale(at(9), at(15), 1, [{ from: at(14, 50), to: at(17), px: 44 }])
    expect(yAt(scale, at(15)) - yAt(scale, at(14, 50))).toBeCloseTo(44)
    expect(yAt(scale, at(6))).toBe(0)
    expect(yAt(scale, at(20))).toBe(scale.height)
  })
})

describe("clockRange", () => {
  it("names the half of the day once when both ends share it", () => {
    expect(clockRange(8 * 60, 9 * 60 + 30)).toBe("8:00–9:30 AM")
    expect(clockRange(11 * 60 + 30, 13 * 60)).toBe("11:30 AM–1:00 PM")
  })

  it("drops :00 only when both ends are whole hours", () => {
    expect(clockRange(14 * 60, 17 * 60)).toBe("2–5 PM")
    expect(clockRange(11 * 60, 13 * 60)).toBe("11 AM–1 PM")
  })

  it("leaves the half of the day to the ruler when bare", () => {
    expect(clockRange(10 * 60 + 15, 11 * 60 + 30, true)).toBe("10:15–11:30")
  })
})
