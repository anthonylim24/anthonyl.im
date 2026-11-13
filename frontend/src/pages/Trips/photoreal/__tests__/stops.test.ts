import { describe, expect, it } from "vitest"
import { makeItem } from "../../__tests__/tripFixtures"
import { dayPins } from "../../map/geo"
import type { TripDay } from "../../types"
import {
  announcement,
  dayMeters,
  dayStops,
  distanceToStops,
  formatDistance,
  isNearby,
  legInto,
  legSummary,
  stepIndex,
  timeRange,
  tourNext,
  tourStart,
} from "../stops"

const place = (id: string, title: string, lat: number, lng: number, time?: string) =>
  makeItem({ id, title, time, location: { name: title, lat, lng, source: "user" } })

const day: TripDay = {
  id: "d1",
  date: "2026-12-05",
  items: [
    place("a", "Pastéis de Belém", 38.6975, -9.2033, "09:30"),
    makeItem({ id: "note", kind: "note", title: "Bring the good camera" }),
    place("b", "Jerónimos Monastery", 38.6979, -9.2068, "10:15"),
    place("c", "Miradouro da Graça", 38.7163, -9.1314),
  ],
}

describe("dayStops", () => {
  it("keeps located items in order and numbers them like the day map", () => {
    const stops = dayStops(day)
    expect(stops.map((s) => [s.id, s.label])).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ])
    expect(stops.map((s) => s.label)).toEqual(dayPins(day).map((pin) => pin.label))
  })
})

describe("names", () => {
  it("leads with the place name and keeps the plan's wording as a second line", () => {
    const [stop] = dayStops({
      id: "d",
      date: "2026-12-05",
      items: [makeItem({ id: "x", title: "Opening entry at Jerónimos Monastery", location: { name: "Jerónimos Monastery", lat: 38.6979, lng: -9.2068, source: "ai" } })],
    })
    expect(stop!.title).toBe("Jerónimos Monastery")
    expect(stop!.plan).toBe("Opening entry at Jerónimos Monastery")
    expect(dayStops(day)[0]!.plan).toBeUndefined()
  })
})

describe("legs", () => {
  const stops = dayStops(day)

  it("has no leg into the first stop", () => {
    expect(legInto(stops, 0)).toBeNull()
  })

  it("gives a walking time at 80 m a minute for a short leg", () => {
    const leg = legInto(stops, 1)!
    expect(leg.from).toBe("Pastéis de Belém")
    expect(leg.meters).toBeGreaterThan(250)
    expect(leg.meters).toBeLessThan(350)
    expect(leg.walkMinutes).toBe(Math.round(leg.meters / 80))
    expect(legSummary(leg)).toMatch(/^\d+ m · \d+ min walk$/)
  })

  it("does not invent a duration past 3 km", () => {
    const leg = legInto(stops, 2)!
    expect(leg.meters).toBeGreaterThan(3000)
    expect(leg.walkMinutes).toBeNull()
    expect(legSummary(leg)).toMatch(/^\d+\.\d km · ride$/)
  })

  it("adds the legs up", () => {
    expect(dayMeters(stops)).toBeCloseTo(legInto(stops, 1)!.meters + legInto(stops, 2)!.meters, 5)
  })

  it("formats distances", () => {
    expect(formatDistance(4)).toBe("10 m")
    expect(formatDistance(648)).toBe("650 m")
    expect(formatDistance(3449)).toBe("3.4 km")
    expect(formatDistance(18_400)).toBe("18 km")
  })

  it("formats a time range", () => {
    expect(timeRange({ time: "14:30", endTime: "16:00" })).toBe("2:30 PM – 4:00 PM")
    expect(timeRange({ time: "14:30" })).toBe("2:30 PM")
    expect(timeRange({})).toBe("")
  })
})

describe("stepping", () => {
  it("stops at both ends", () => {
    expect(stepIndex(0, -1, 4)).toBe(0)
    expect(stepIndex(3, 1, 4)).toBe(3)
    expect(stepIndex(1, 1, 4)).toBe(2)
  })

  it("enters from the overview at the first or last stop", () => {
    expect(stepIndex(null, 1, 4)).toBe(0)
    expect(stepIndex(null, -1, 4)).toBe(3)
    expect(stepIndex(null, 1, 0)).toBeNull()
  })
})

describe("tour", () => {
  it("walks every stop once, then ends", () => {
    const seen: number[] = []
    let at = tourStart(null, 3)
    while (at !== null) {
      seen.push(at)
      at = tourNext(at, 3)
    }
    expect(seen).toEqual([0, 1, 2])
  })

  it("resumes from the current stop, and restarts from the last one", () => {
    expect(tourStart(1, 4)).toBe(1)
    expect(tourStart(3, 4)).toBe(0)
    expect(tourStart(null, 0)).toBeNull()
  })
})

describe("announcement", () => {
  it("reads position, name and time", () => {
    const stops = dayStops(day)
    expect(announcement(stops[1]!, stops.length)).toBe("Stop 2 of 3: Jerónimos Monastery, 10:15 AM")
    expect(announcement(stops[2]!, stops.length)).toBe("Stop 3 of 3: Miradouro da Graça")
  })
})

describe("you", () => {
  const stops = dayStops(day)

  it("is on the map from across town", () => {
    expect(isNearby({ lat: 38.7369, lng: -9.1427 }, stops)).toBe(true)
  })

  it("is not on the map from another continent", () => {
    const sanFrancisco = { lat: 37.7749, lng: -122.4194 }
    expect(isNearby(sanFrancisco, stops)).toBe(false)
    expect(distanceToStops(sanFrancisco, stops)).toBeGreaterThan(8_000_000)
    expect(distanceToStops(sanFrancisco, [])).toBe(Infinity)
  })
})
