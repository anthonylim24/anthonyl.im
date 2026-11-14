import { describe, expect, it } from "vitest"
import {
  centroid,
  dayPins,
  dayRoute,
  distanceMeters,
  formatCoord,
  locatedItems,
  projectToBox,
  routeMeters,
  spanMeters,
  splitDay,
  DAY_PIN,
  tripDots,
  tripPins,
} from "../map/geo"
import type { ItineraryItem, TripDay } from "../types"

function item(id: string, title: string, at?: { lat: number; lng: number }, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id,
    kind: "place",
    title,
    status: "none",
    createdBy: "user",
    location: at ? { name: `${title} (place)`, lat: at.lat, lng: at.lng, source: "user" } : undefined,
    ...overrides,
  }
}

function day(id: string, items: ItineraryItem[]): TripDay {
  return { id, date: "2026-07-10", items }
}

const A = { lat: 38.7, lng: -9.14 }
const B = { lat: 38.72, lng: -9.1 }

describe("distanceMeters", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceMeters(A, A)).toBe(0)
    expect(distanceMeters(A, B)).toBeCloseTo(distanceMeters(B, A), 6)
  })

  it("measures one degree of latitude as about 111 km", () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_400)
  })

  it("shrinks a degree of longitude with latitude", () => {
    const equator = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    const north = distanceMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })
    expect(north / equator).toBeCloseTo(0.5, 2)
  })
})

describe("spanMeters", () => {
  it("is zero for fewer than two points", () => {
    expect(spanMeters([])).toBe(0)
    expect(spanMeters([A])).toBe(0)
  })

  it("is the diagonal of the bounding box", () => {
    const points = [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 20.5 },
      { lat: 10.5, lng: 22 },
    ]
    expect(spanMeters(points)).toBeCloseTo(distanceMeters({ lat: 10, lng: 20 }, { lat: 11, lng: 22 }), 6)
  })
})

describe("centroid", () => {
  it("returns null for no points and the mean otherwise", () => {
    expect(centroid([])).toBeNull()
    expect(centroid([{ lat: 0, lng: 10 }, { lat: 4, lng: 20 }])).toEqual({ lat: 2, lng: 15 })
  })
})

describe("pins and routes", () => {
  const d1 = day("day-1", [
    item("a", "Market", A),
    item("note", "Bring cash", undefined, { kind: "note" }),
    item("unpinned", "Somewhere", undefined, { location: { name: "Somewhere", source: "user" } }),
    item("b", "", B),
  ])
  const d2 = day("day-2", [item("c", "Tower", { lat: 38.69, lng: -9.21 })])

  it("numbers only located items, in itinerary order", () => {
    const pins = dayPins(d1)
    expect(pins.map((p) => [p.id, p.label, p.variant])).toEqual([
      ["a", "1", "stop"],
      ["b", "2", "stop"],
    ])
    expect(pins[0]).toMatchObject({ lat: A.lat, lng: A.lng, title: "Market" })
  })

  it("falls back to the location name for an untitled stop", () => {
    expect(dayPins(day("x", [item("z", "", A, { location: { name: "Pastelaria", lat: 1, lng: 2, source: "ai" } })]))[0]!.title).toBe(
      "Pastelaria",
    )
  })

  it("marks just-added pins as fresh", () => {
    const pins = dayPins(d1, new Set(["b"]))
    expect(pins.map((p) => Boolean(p.fresh))).toEqual([false, true])
  })

  it("puts one pin per day at the centre of that day's stops", () => {
    const titled: TripDay = { ...d1, title: "Alfama" }
    const pins = tripPins({ days: [titled, d2] })
    expect(pins.map((p) => [p.id, p.label, p.variant, p.title])).toEqual([
      ["day:day-1", "1", "stop", "Day 1, Alfama: 2 pinned stops"],
      ["day:day-2", "2", "stop", "Day 2: 1 pinned stop"],
    ])
    expect(pins[0]!.id).toBe(`${DAY_PIN}day-1`)
    expect(pins[0]!.lat).toBeCloseTo((A.lat + B.lat) / 2, 9)
    expect(pins[0]!.lng).toBeCloseTo((A.lng + B.lng) / 2, 9)
    expect(pins[1]).toMatchObject({ lat: 38.69, lng: -9.21 })
  })

  it("skips days with nothing pinned but keeps their day number", () => {
    const pins = tripPins({ days: [day("day-1", [item("n", "Note")]), d2] })
    expect(pins.map((p) => [p.id, p.label])).toEqual([["day:day-2", "2"]])
    expect(tripPins({ days: [] })).toEqual([])
  })

  it("lists every located stop on the trip as a dot", () => {
    expect(tripDots({ days: [d1, d2] })).toEqual([A, B, { lat: 38.69, lng: -9.21 }])
    expect(tripDots({ days: [day("empty", [])] })).toEqual([])
  })

  it("builds the day route from located items only", () => {
    expect(dayRoute(d1)).toEqual([A, B])
    expect(dayRoute(day("empty", []))).toEqual([])
  })

  it("sums the legs of a route", () => {
    const C = { lat: 38.75, lng: -9.05 }
    expect(routeMeters([])).toBe(0)
    expect(routeMeters([A])).toBe(0)
    expect(routeMeters([A, B, C])).toBeCloseTo(distanceMeters(A, B) + distanceMeters(B, C), 6)
  })
})

describe("formatCoord", () => {
  it("prints hemisphere letters with two decimals", () => {
    expect(formatCoord({ lat: 37.5665, lng: 126.978 })).toBe("37.57°N 126.98°E")
    expect(formatCoord({ lat: -33.8688, lng: -70.6693 })).toBe("33.87°S 70.67°W")
    expect(formatCoord({ lat: 0, lng: 0 })).toBe("0.00°N 0.00°E")
  })
})

describe("projectToBox", () => {
  it("returns nothing for no points", () => {
    expect(projectToBox([], 400, 300, 56)).toEqual([])
  })

  it("lands a single point in the centre", () => {
    expect(projectToBox([A], 400, 300, 56)).toEqual([{ x: 200, y: 150 }])
  })

  it("lands identical points in the centre", () => {
    expect(projectToBox([A, A], 400, 300, 56)).toEqual([
      { x: 200, y: 150 },
      { x: 200, y: 150 },
    ])
  })

  it("keeps every point inside the inset box", () => {
    const points = [
      { lat: 37.5, lng: 126.9 },
      { lat: 35.1, lng: 129.0 },
      { lat: 36.3, lng: 127.4 },
      { lat: 33.5, lng: 126.5 },
    ]
    const out = projectToBox(points, 400, 300, 56)
    expect(out).toHaveLength(points.length)
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(56 - 1e-6)
      expect(p.x).toBeLessThanOrEqual(400 - 56 + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(56 - 1e-6)
      expect(p.y).toBeLessThanOrEqual(300 - 56 + 1e-6)
    }
  })

  it("puts north at the top and east on the right", () => {
    const [north, south] = projectToBox([{ lat: 10, lng: 0 }, { lat: 0, lng: 0 }], 400, 300, 20)
    expect(north!.y).toBeLessThan(south!.y)
    const [west, east] = projectToBox([{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }], 400, 300, 20)
    expect(west!.x).toBeLessThan(east!.x)
    // A purely horizontal spread fills the usable width.
    expect(west!.x).toBeCloseTo(20, 6)
    expect(east!.x).toBeCloseTo(380, 6)
  })
})

describe("places parked under To schedule", () => {
  const at = (id: string, lat: number, lng: number) =>
    ({ id, kind: "place", title: id, status: "none", createdBy: "user", location: { name: id, lat, lng, source: "user" } }) as const
  const day = {
    id: "d",
    date: "2026-12-05",
    items: [
      at("a", 38.715, -9.126),
      at("b", 38.716, -9.131),
      { id: "h", kind: "section", title: "To schedule", status: "none", createdBy: "user" } as const,
      at("far", 38.6975, -9.2032),
    ],
  }

  it("stay off the route and out of the stop numbering", () => {
    expect(locatedItems(day).map((i) => i.id)).toEqual(["a", "b"])
    expect(dayRoute(day)).toHaveLength(2)
    expect(splitDay(day).parked.map((i) => i.id)).toEqual(["far"])
  })

  it("still show on the map, as unnumbered dots", () => {
    const pins = dayPins(day)
    expect(pins.map((p) => [p.id, p.variant, p.label])).toEqual([
      ["a", "stop", "1"],
      ["b", "stop", "2"],
      ["far", "dot", undefined],
    ])
  })

  it("a day without the heading is all plan", () => {
    expect(splitDay({ items: day.items.slice(0, 2) }).parked).toEqual([])
  })
})

describe("splitDay with odd documents", () => {
  it("does not throw on a section that has no title", () => {
    const untitled = { id: "s", kind: "section", status: "none", createdBy: "user" } as unknown as ItineraryItem
    const items = [item("a", "A", { lat: 1, lng: 1 }), untitled, item("b", "B", { lat: 2, lng: 2 })]
    expect(splitDay({ items })).toEqual({ planned: items, parked: [] })
  })
})
