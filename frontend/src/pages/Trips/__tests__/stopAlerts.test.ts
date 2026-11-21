import { describe, expect, it } from "vitest"
import type { HourForecast } from "../forecast"
import { TO_SCHEDULE } from "../map/geo"
import type { ItineraryItem, TripDay } from "../types"
import { stopAlerts } from "../workspace/stopAlerts"
import { makeItem } from "./tripFixtures"

const KYOTO = { lat: 35.0, lng: 135.77 }
const north = (km: number) => ({ lat: KYOTO.lat + km / 111.195, lng: KYOTO.lng })

function stop(id: string, time?: string, endTime?: string, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return makeItem({ id, title: id, time, endTime, ...overrides })
}

const day = (items: ItineraryItem[]): TripDay => ({ id: "d1", date: "2026-11-21", items })

/** A dry day with showers (WMO 81) likely from 14:00 to 17:00. */
const SHOWERY: HourForecast[] = Array.from({ length: 24 }, (_, h) => ({
  time: `${String(h).padStart(2, "0")}:00`,
  tempC: 12,
  rainChance: h >= 14 && h <= 16 ? 60 : 10,
  code: h >= 14 && h <= 16 ? 81 : 2,
}))

describe("stopAlerts", () => {
  it("warns on the later of two overlapping stops only", () => {
    const alerts = stopAlerts(day([stop("Kiyomizu-dera", "10:15", "11:30"), stop("Tea ceremony", "11:00", "12:00")]), undefined)
    expect(alerts.get("Tea ceremony")).toEqual({ conflict: "Overlaps Kiyomizu-dera", rain: null })
    expect(alerts.has("Kiyomizu-dera")).toBe(false)
  })

  it("counts further collisions after the first", () => {
    const alerts = stopAlerts(day([stop("A", "10:00", "12:00"), stop("B", "10:30", "12:00"), stop("C", "11:00", "11:30")]), undefined)
    expect(alerts.get("C")?.conflict).toBe("Overlaps A · +1")
  })

  it("flags a leg that does not fit the gap", () => {
    const from = stop("Shrine", "09:00", "10:00", { location: { name: "Shrine", ...north(0), source: "user" } })
    const to = stop("Market", "10:00", "11:00", { location: { name: "Market", ...north(3), source: "user" } })
    expect(stopAlerts(day([from, to]), undefined).get("Market")?.conflict).toMatch(/^Tight · .*, no gap$/)
  })

  it("says what falls and how likely while a stop is on", () => {
    const alerts = stopAlerts(day([stop("Lunch", "12:30", "13:30"), stop("Gion", "15:30", "18:00"), stop("Dinner", "18:30", "20:30")]), SHOWERY)
    expect(alerts.get("Gion")).toEqual({ conflict: null, rain: "Showers likely · 60% chance" })
    expect(alerts.has("Lunch")).toBe(false)
    expect(alerts.has("Dinner")).toBe(false)
  })

  it("reads a stop with no end time for as long as it usually takes", () => {
    // A museum runs about two hours: 13:00 reaches the 14:00 showers.
    const museum = stop("Museum", "13:00", undefined, { location: { name: "Museum", category: "museum", source: "user" } })
    expect(stopAlerts(day([museum]), SHOWERY).get("Museum")?.rain).toBe("Showers likely · 60% chance")
  })

  it("leaves untimed and parked places alone", () => {
    const parked = makeItem({ id: "parked", kind: "section", title: TO_SCHEDULE })
    const alerts = stopAlerts(day([stop("Anytime"), parked, stop("Later", "15:00", "16:00")]), SHOWERY)
    expect(alerts.size).toBe(0)
  })

  it("says nothing without a forecast or a clash", () => {
    expect(stopAlerts(day([stop("A", "09:00", "10:00"), stop("B", "15:00", "16:00")]), undefined).size).toBe(0)
  })
})
