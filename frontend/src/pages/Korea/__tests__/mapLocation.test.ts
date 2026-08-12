import { describe, expect, it } from "vitest"
import {
  coordsEqual,
  haversineMeters,
  isInTripArea,
  medianLatLng,
  resolveMapLocation,
  TRIP_AREA_RADIUS_M,
} from "../mapLocation"

describe("haversineMeters", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineMeters({ lat: 37.5, lng: 127.0 }, { lat: 37.5, lng: 127.0 })).toBeLessThan(1)
  })

  it("measures Seoul–Busan on the order of 300+ km", () => {
    const d = haversineMeters(
      { lat: 37.5665, lng: 126.978 },
      { lat: 35.1796, lng: 129.0756 },
    )
    expect(d).toBeGreaterThan(300_000)
    expect(d).toBeLessThan(450_000)
  })
})

describe("medianLatLng", () => {
  it("returns null for empty input", () => {
    expect(medianLatLng([])).toBeNull()
  })

  it("returns the sole point", () => {
    expect(medianLatLng([{ lat: 1, lng: 2 }])).toEqual({ lat: 1, lng: 2 })
  })

  it("averages the middle pair for even counts", () => {
    expect(
      medianLatLng([
        { lat: 0, lng: 0 },
        { lat: 2, lng: 4 },
        { lat: 10, lng: 10 },
        { lat: 4, lng: 8 },
      ]),
    ).toEqual({ lat: 3, lng: 6 })
  })

  it("is robust to a single outlier", () => {
    const m = medianLatLng([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.01 },
      { lat: 37.52, lng: 127.02 },
      { lat: 0, lng: 0 },
    ])
    expect(m!.lat).toBeGreaterThan(37)
    expect(m!.lng).toBeGreaterThan(127)
  })
})

describe("isInTripArea", () => {
  const seoul = { lat: 37.55, lng: 127.0 }

  it("accepts a nearby point", () => {
    expect(isInTripArea({ lat: 37.56, lng: 127.01 }, seoul)).toBe(true)
  })

  it("rejects a distant point", () => {
    expect(isInTripArea({ lat: 37.79, lng: -122.41 }, seoul)).toBe(false)
  })

  it("honors a custom radius", () => {
    expect(isInTripArea({ lat: 37.56, lng: 127.01 }, seoul, 10)).toBe(false)
  })
})

describe("resolveMapLocation", () => {
  const gangnam = [
    { lat: 37.5, lng: 127.03 },
    { lat: 37.51, lng: 127.04 },
    { lat: 37.52, lng: 127.05 },
  ]

  it("uses live geolocation when the device is in the trip area", () => {
    const resolved = resolveMapLocation({
      device: { lat: 37.505, lng: 127.035 },
      places: gangnam,
      fallbackCenter: { lat: 37.5, lng: 127.05 },
    })
    expect(resolved).toEqual({
      lat: 37.505,
      lng: 127.035,
      source: "geolocation",
      label: "You",
    })
  })

  it("mocks to the day median when the device is elsewhere", () => {
    const resolved = resolveMapLocation({
      device: { lat: 37.79, lng: -122.41 },
      places: gangnam,
      fallbackCenter: { lat: 37.5, lng: 127.05 },
      fallbackLabel: "Park Hyatt Seoul",
    })
    expect(resolved?.source).toBe("day-center")
    expect(resolved?.label).toBe("Day center")
    expect(resolved?.lat).toBeCloseTo(37.51, 5)
  })

  it("falls back to hotel center when there are no places", () => {
    const resolved = resolveMapLocation({
      device: null,
      places: [],
      fallbackCenter: { lat: 37.5, lng: 127.05 },
      fallbackLabel: "Park Hyatt Seoul",
    })
    expect(resolved).toEqual({
      lat: 37.5,
      lng: 127.05,
      source: "day-center",
      label: "Park Hyatt Seoul",
    })
  })

  it("returns null when nothing is known", () => {
    expect(
      resolveMapLocation({ device: null, places: [], fallbackCenter: null }),
    ).toBeNull()
  })

  it("uses the default trip-area radius constant", () => {
    expect(TRIP_AREA_RADIUS_M).toBe(80_000)
  })
})

describe("coordsEqual", () => {
  it("treats near-identical floats as equal", () => {
    expect(coordsEqual({ lat: 1, lng: 2 }, { lat: 1 + 1e-9, lng: 2 })).toBe(true)
  })

  it("rejects meaningfully different coords", () => {
    expect(coordsEqual({ lat: 1, lng: 2 }, { lat: 1.01, lng: 2 })).toBe(false)
  })
})
