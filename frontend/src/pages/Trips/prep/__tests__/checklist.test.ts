import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { ChecklistItem, DayWeather, ItineraryItem, Trip } from "../../types"
import {
  GROUPS,
  addItems,
  assignItem,
  hasText,
  initials,
  newChecklistItem,
  progress,
  removeItems,
  renameItem,
  restoreItems,
  setDone,
  suggestChecklist,
} from "../checklist"

const entry = (id: string, text: string, overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id,
  text,
  done: false,
  group: "packing",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
})

function tripWith({
  weather,
  items = [],
  destinations = ["Lisbon"],
  timezone = "Europe/Lisbon",
  nights = 1,
}: {
  weather?: DayWeather
  items?: ItineraryItem[]
  destinations?: string[]
  timezone?: string
  nights?: number
}): Trip {
  const end = new Date(Date.UTC(2026, 6, 10 + nights)).toISOString().slice(0, 10)
  return makeTrip({
    destinations,
    timezone,
    endDate: end,
    days: [{ id: "day-1", date: "2026-07-10", weather, items }],
  })
}

const texts = (trip: Trip, existing: Array<{ text: string }> = [], home?: string) =>
  suggestChecklist(trip, existing, home).map((s) => s.text)

describe("progress", () => {
  it("counts done entries", () => {
    expect(progress([])).toEqual({ done: 0, total: 0 })
    expect(progress([entry("a", "A", { done: true }), entry("b", "B")])).toEqual({ done: 1, total: 2 })
  })
})

describe("newChecklistItem", () => {
  it("makes an unchecked entry with a ck- id", () => {
    const item = newChecklistItem("  Sunscreen ", "packing")
    expect(item.id).toMatch(/^ck-[0-9a-f]{8}$/)
    expect(item).toMatchObject({ text: "Sunscreen", done: false, group: "packing" })
    expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false)
    expect(newChecklistItem("x", "todo").id).not.toBe(item.id)
  })
})

describe("GROUPS", () => {
  it("names the three groups in order", () => {
    expect(GROUPS.map((g) => g.label)).toEqual(["Packing", "Before you go", "Documents"])
  })
})

describe("edits", () => {
  const list = [entry("a", "Passport", { group: "documents" }), entry("b", "Socks"), entry("c", "Hat", { done: true })]

  it("return the same array when nothing changes", () => {
    expect(setDone(list, "c", true)).toBe(list)
    expect(renameItem(list, "b", " Socks ")).toBe(list)
    expect(renameItem(list, "b", "   ")).toBe(list)
    expect(assignItem(list, "b", undefined)).toBe(list)
    expect(removeItems(list, ["zzz"]).list).toBe(list)
    expect(addItems(list, [list[0] as ChecklistItem])).toBe(list)
  })

  it("toggle, rename and assign one entry", () => {
    expect(setDone(list, "b", true)[1]?.done).toBe(true)
    expect(renameItem(list, "b", "Wool socks")[1]?.text).toBe("Wool socks")
    const assigned = assignItem(list, "b", "p1")
    expect(assigned[1]?.assignee).toBe("p1")
    expect("assignee" in (assignItem(assigned, "b", undefined)[1] ?? {})).toBe(false)
  })

  it("puts removed entries back where they stood, once", () => {
    const { list: without, removed } = removeItems(list, ["a", "c"])
    expect(without.map((i) => i.id)).toEqual(["b"])
    expect(removed.map((r) => r.index)).toEqual([0, 2])
    const back = restoreItems(without, removed)
    expect(back.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(restoreItems(back, removed)).toBe(back)
  })

  it("compares text ignoring case, spacing and curly quotes", () => {
    expect(hasText([entry("a", "Tell your bank you’re travelling")], "tell your BANK  you're travelling")).toBe(true)
    expect(hasText([entry("a", "Socks")], "Sock")).toBe(false)
  })
})

describe("initials", () => {
  it("takes the first and last names' first letters", () => {
    expect(initials("Anthony Lim")).toBe("AL")
    expect(initials("ana")).toBe("A")
    expect(initials("Mary Jane Watson")).toBe("MW")
    expect(initials("김민수")).toBe("김")
    expect(initials("  ")).toBe("?")
  })
})

describe("suggestChecklist", () => {
  it("always offers the essentials and the jobs before you go", () => {
    const out = suggestChecklist(tripWith({}), [])
    expect(out).toEqual(
      expect.arrayContaining([
        { text: "Passport or ID", group: "documents" },
        { text: "Phone charger", group: "packing" },
        { text: "Medications", group: "packing" },
        { text: "Download offline maps", group: "todo" },
        { text: "Buy travel insurance", group: "todo" },
        { text: "Set up an eSIM or roaming", group: "todo" },
        { text: "Tell your bank you’re travelling", group: "todo" },
      ]),
    )
    // Grouped in panel order: packing, then before you go, then documents.
    const order = out.map((s) => GROUPS.findIndex((g) => g.id === s.group))
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })

  it("is deterministic", () => {
    const trip = tripWith({ weather: { highC: 30, lowC: 8, condition: "Showers" } })
    expect(suggestChecklist(trip, [], "US")).toEqual(suggestChecklist(trip, [], "US"))
  })

  it("reads the weather", () => {
    expect(texts(tripWith({ weather: { highC: 12, lowC: 4, condition: "Clear" } }))).toContain("Warm layers")
    const hot = texts(tripWith({ weather: { highC: 31, lowC: 22, condition: "Sunny" } }))
    expect(hot).toEqual(expect.arrayContaining(["Sunscreen", "Sun hat"]))
    for (const condition of ["Light rain", "Scattered showers", "Drizzle", "Thunderstorms"]) {
      expect(texts(tripWith({ weather: { highC: 20, lowC: 15, condition } }))).toContain("Umbrella or rain jacket")
    }
  })

  it("stays quiet at the weather boundaries", () => {
    const mild = texts(tripWith({ weather: { highC: 26, lowC: 10, condition: "Partly cloudy" } }))
    for (const text of ["Warm layers", "Sunscreen", "Sun hat", "Umbrella or rain jacket"]) expect(mild).not.toContain(text)
  })

  it("reads places on the plan", () => {
    const at = (title: string, category?: string) =>
      texts(tripWith({ items: [makeItem({ title, location: category ? { name: title, category, source: "user" } : undefined })] }))
    expect(at("Haeundae Beach")).toContain("Swimwear")
    expect(at("Bukhansan hike")).toContain("Hiking shoes")
    expect(at("Mount Takao trail")).toContain("Hiking shoes")
    expect(at("Bulguksa Temple")).toContain("Clothes that cover shoulders and knees")
    expect(at("Kinkaku-ji")).toContain("Clothes that cover shoulders and knees")
    expect(at("Meiji Jingu", "shrine")).toContain("Clothes that cover shoulders and knees")
    expect(at("Dragon Hill jjimjilbang")).toContain("Read up on bathhouse etiquette")
  })

  it("does not read too much into place names", () => {
    const nothing = ["Swimwear", "Hiking shoes", "Clothes that cover shoulders and knees", "Read up on bathhouse etiquette"]
    for (const title of ["Christchurch Botanic Gardens", "Spanish Steps", "Spain pavilion", "Watson's Bay lookout", "Mountainside café"]) {
      const out = texts(tripWith({ items: [makeItem({ title })] }))
      for (const text of nothing) expect(out, title).not.toContain(text)
    }
  })

  it("reads bookings", () => {
    const booking = (title: string, type: string) =>
      makeItem({ id: title, title, kind: "reservation", reservation: { type, status: "confirmed" } })
    const out = texts(
      tripWith({
        items: [
          booking("ICN → LAX", "flight"),
          booking("Hotel Shilla", "hotel"),
          booking("KTX to Busan", "transit"),
          booking("Ferry to Jeju", "transit"),
          booking("Cooking class", "experience"),
        ],
      }),
    )
    expect(out).toEqual(
      expect.arrayContaining([
        "Check in online for flights",
        "Boarding passes",
        "Hotel booking confirmations",
        "Train tickets",
        "Ferry tickets",
        "Tickets for tours and events",
      ]),
    )
    expect(out).not.toContain("Bus tickets")
  })

  it("plans laundry for a week or more", () => {
    expect(texts(tripWith({ nights: 6 }))).not.toContain("Laundry detergent sheets")
    expect(texts(tripWith({ nights: 7 }))).toEqual(expect.arrayContaining(["Laundry detergent sheets", "Plan a laundry stop"]))
  })

  it("suggests an adapter only when the traveller's plugs don't fit", () => {
    const seoul = tripWith({ destinations: ["Seoul"], timezone: "Asia/Seoul" })
    expect(texts(seoul, [], "US")).toContain("Power adapter (type C, F)")
    expect(texts(seoul, [], "US")).toContain("Check hair tools and other appliances are dual voltage")
    expect(texts(seoul, [], "US")).toContain("Passport")
    expect(texts(seoul, [], "US")).toContain("Check visa and entry requirements")
    const fromGermany = texts(seoul, [], "DE")
    expect(fromGermany.some((t) => t.startsWith("Power adapter"))).toBe(false)
    expect(fromGermany).not.toContain("Check hair tools and other appliances are dual voltage")
  })

  it("keeps a trip at home light", () => {
    const home = texts(tripWith({ destinations: ["Busan"], timezone: "Asia/Seoul" }), [], "KR")
    expect(home.some((t) => t.startsWith("Power adapter"))).toBe(false)
    expect(home).toContain("Passport or ID")
    expect(home).not.toContain("Set up an eSIM or roaming")
    expect(home).not.toContain("Check visa and entry requirements")
  })

  it("suggests the adapter generically when home is unknown", () => {
    expect(texts(tripWith({ destinations: ["Seoul"], timezone: "Asia/Seoul" }))).toContain("Power adapter (type C, F)")
    expect(texts(tripWith({ destinations: ["Atlantis"], timezone: "UTC" }))).toContain("Power adapter")
    expect(texts(tripWith({ destinations: ["Atlantis"], timezone: "UTC" }), [], "NOPE")).toContain("Power adapter")
  })

  it("leaves out what the list already has, ignoring case", () => {
    const trip = tripWith({ weather: { highC: 30, lowC: 20, condition: "Rain" } })
    const out = texts(trip, [{ text: "sunscreen" }, { text: "  PHONE   charger " }, { text: "My passport" }])
    expect(out).not.toContain("Sunscreen")
    expect(out).not.toContain("Phone charger")
    expect(out).not.toContain("Passport or ID")
    expect(out).toContain("Sun hat")
  })

  it("adds nothing the second time round", () => {
    const trip = tripWith({
      destinations: ["Tokyo"],
      timezone: "Asia/Tokyo",
      nights: 9,
      weather: { highC: 31, lowC: 5, condition: "Showers" },
      items: [makeItem({ title: "Senso-ji Temple" }), makeItem({ id: "f", title: "Flight", kind: "reservation", reservation: { type: "flight", status: "confirmed" } })],
    })
    const first = suggestChecklist(trip, [], "GB")
    expect(first.length).toBeGreaterThan(10)
    expect(new Set(first.map((s) => s.text.toLowerCase())).size).toBe(first.length)
    expect(suggestChecklist(trip, first, "GB")).toEqual([])
  })
})
