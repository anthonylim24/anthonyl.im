import { describe, expect, it } from "vitest"
import type { PlaceResult } from "../geocode"
import { dayBias, dayHolding, tripPlaces } from "../searchArea"
import type { ItineraryItem, Trip } from "../types"

const place = (id: string, title: string, at: { lat: number; lng: number }, extra: { category?: string; placeId?: string } = {}): ItineraryItem => ({
  id,
  kind: "place",
  title,
  status: "none",
  createdBy: "user",
  location: { name: title, source: "user", ...extra, ...at },
})
const note = (id: string, title: string): ItineraryItem => ({ id, kind: "note", title, status: "none", createdBy: "user" })

const days = (...items: ItineraryItem[][]): Trip["days"] =>
  items.map((list, i) => ({ id: `day-${i + 1}`, date: `2026-12-${String(i + 10).padStart(2, "0")}`, items: list }))

// Tokyo then Kyoto, planned only in Tokyo so far: days 4 and 5 are empty and name no city.
const shibuya = place("s1", "Shibuya Crossing", { lat: 35.6595, lng: 139.7005 })
const asakusa = place("s2", "Sensō-ji", { lat: 35.7148, lng: 139.7967 }, { placeId: "ChIJsensoji" })
const ryokan = place("h1", "Kyoto Ryokan", { lat: 35.0037, lng: 135.7788 }, { category: "hotel" })
const toyosu = place("i1", "Toyosu Market", { lat: 35.6457, lng: 139.7845 })
const tokyoKyoto: Pick<Trip, "days" | "destinations" | "ideas" | "center"> = {
  days: days([shibuya], [asakusa, note("n1", "Rest")], [], [], []),
  destinations: ["Tokyo, Japan", "Kyoto"],
  ideas: [toyosu, { ...toyosu, id: "i2", location: undefined }],
  center: { lat: 35.68, lng: 139.76 },
}

describe("tripPlaces", () => {
  it("measures near against every place on the trip and every town it names", () => {
    const { anchors, stops } = tripPlaces(tokyoKyoto)
    expect(anchors.points).toEqual([
      { lat: 35.68, lng: 139.76 },
      { lat: 35.6595, lng: 139.7005 },
      { lat: 35.7148, lng: 139.7967 },
      { lat: 35.6457, lng: 139.7845 },
    ])
    expect(anchors.towns).toEqual(["tokyo", "kyoto"])
    expect(stops).toEqual([
      { day: 1, key: "shibuya crossing", placeId: null, lat: 35.6595, lng: 139.7005 },
      { day: 2, key: "senso ji", placeId: "ChIJsensoji", lat: 35.7148, lng: 139.7967 },
    ])
  })

  it("adds the days' own cities", () => {
    const named = { ...tokyoKyoto, destinations: ["Japan"], days: tokyoKyoto.days.map((day, i) => ({ ...day, city: i < 3 ? "Tokyo" : "Kyoto" })) }
    expect(tripPlaces(named).anchors.towns).toEqual(["japan", "tokyo", "kyoto"])
  })

  it("knows nothing without a trip", () => {
    expect(tripPlaces(null)).toEqual({ anchors: { points: [], towns: [] }, stops: [] })
  })
})

describe("dayHolding", () => {
  const { stops } = tripPlaces(tokyoKyoto)
  const result = (name: string, at: { lat: number; lng: number }, placeId?: string): PlaceResult => ({ id: name, name, context: "", ...at, placeId })

  it("is the day a place is on, by its Google id or its name at the same spot", () => {
    expect(dayHolding(result("Senso-ji Temple", { lat: 35.71, lng: 139.79 }, "ChIJsensoji"), stops)).toBe(2)
    expect(dayHolding(result("SHIBUYA CROSSING", { lat: 35.6596, lng: 139.7006 }), stops)).toBe(1)
  })

  it("is null for a namesake elsewhere or a new place", () => {
    expect(dayHolding(result("Shibuya Crossing", { lat: 35.0, lng: 135.76 }), stops)).toBeNull()
    expect(dayHolding(result("Kinkaku-ji", { lat: 35.0394, lng: 135.7292 }, "ChIJkinkakuji"), stops)).toBeNull()
  })
})

describe("dayBias", () => {
  const fallback = { lat: 1, lng: 2 }

  it("is the middle of the day's own stops", () => {
    expect(dayBias(tokyoKyoto, 0, fallback)).toEqual({ lat: 35.6595, lng: 139.7005 })
  })

  it("is where the traveller sleeps on a day with no stops", () => {
    const moved = { days: days([shibuya], [ryokan], [], []) }
    expect(dayBias(moved, 2, fallback)).toEqual({ lat: 35.0037, lng: 135.7788 })
  })

  it("is the nearest planned day otherwise, the earlier on a tie", () => {
    expect(dayBias(tokyoKyoto, 3, fallback)).toEqual({ lat: 35.7148, lng: 139.7967 })
    const between = { days: days([shibuya], [], [asakusa]) }
    expect(dayBias(between, 1, fallback)).toEqual({ lat: 35.6595, lng: 139.7005 })
  })

  it("is the fallback when no day has a stop", () => {
    expect(dayBias({ days: days([], []) }, 1, fallback)).toBe(fallback)
    expect(dayBias({ days: days([]) }, 5, fallback)).toBe(fallback)
  })
})
