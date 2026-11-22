import { describe, expect, it } from "vitest"
import { directionsLink, externalMapsApp, externalMapsHref, externalMapsLink, prefersAppleMaps } from "../externalMaps"

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"

describe("prefersAppleMaps", () => {
  it("selects Apple on iOS, iPadOS, and Mac", () => {
    expect(prefersAppleMaps(IPHONE)).toBe(true)
    expect(prefersAppleMaps(IPAD)).toBe(true)
    expect(prefersAppleMaps(MAC)).toBe(true)
  })

  it("selects Google on Android, Windows, and empty UA", () => {
    expect(prefersAppleMaps(ANDROID)).toBe(false)
    expect(prefersAppleMaps(WINDOWS)).toBe(false)
    expect(prefersAppleMaps("")).toBe(false)
    expect(externalMapsApp(ANDROID)).toBe("google")
    expect(externalMapsApp(IPHONE)).toBe("apple")
  })
})

describe("externalMapsHref", () => {
  it("pins Apple Maps with coordinates and a search label", () => {
    expect(
      externalMapsHref({ name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7 }, IPHONE),
    ).toBe("https://maps.apple.com/?ll=35.66,139.7&q=Ichiran%2C%20Shibuya")
  })

  it("searches Apple Maps by name when coordinates are missing", () => {
    expect(externalMapsHref({ name: "Senso-ji" }, IPHONE)).toBe("https://maps.apple.com/?q=Senso-ji")
  })

  it("prefers a Google Maps place URL on Google, and coords on Apple", () => {
    const place = {
      name: "Ichiran",
      lat: 35.66,
      lng: 139.7,
      mapsUrl: "https://www.google.com/maps/place/Ichiran/@35.66,139.7",
    }
    expect(externalMapsHref(place, ANDROID)).toBe(place.mapsUrl)
    expect(externalMapsHref(place, IPHONE)).toBe("https://maps.apple.com/?ll=35.66,139.7&q=Ichiran")
  })

  it("builds a Google search from coordinates or a name", () => {
    expect(externalMapsHref({ lat: 35.66, lng: 139.7 }, ANDROID)).toBe(
      "https://www.google.com/maps/search/?api=1&query=35.66,139.7",
    )
    expect(externalMapsHref({ name: "Senso-ji", address: "Asakusa" }, WINDOWS)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Senso-ji%2C%20Asakusa",
    )
  })

  it("rejects javascript mapsUrl and empty targets", () => {
    expect(externalMapsHref({ mapsUrl: "javascript:alert(1)" }, ANDROID)).toBeUndefined()
    expect(externalMapsHref({ mapsUrl: "http://maps.google.com/?q=x" }, ANDROID)).toBeUndefined()
    expect(externalMapsHref({}, ANDROID)).toBeUndefined()
  })

  it("rejects an arbitrary https mapsUrl", () => {
    expect(externalMapsHref({ mapsUrl: "https://example.invalid/place" }, ANDROID)).toBeUndefined()
    expect(externalMapsHref({ mapsUrl: "https://example.invalid/place" }, IPHONE)).toBeUndefined()
  })

  it("falls back to a recognized mapsUrl when there is nothing else to search", () => {
    expect(externalMapsHref({ mapsUrl: "https://maps.apple.com/?q=Ichiran" }, ANDROID)).toBe(
      "https://maps.apple.com/?q=Ichiran",
    )
  })
})

describe("externalMapsLink", () => {
  it("labels the destination app", () => {
    expect(externalMapsLink({ name: "Ichiran", lat: 35.66, lng: 139.7 }, IPHONE)).toEqual({
      href: "https://maps.apple.com/?ll=35.66,139.7&q=Ichiran",
      app: "apple",
      label: "Open Ichiran in Apple Maps",
    })
    expect(externalMapsLink({ name: "Ichiran", lat: 35.66, lng: 139.7 }, ANDROID)?.label).toBe(
      "Open Ichiran in Google Maps",
    )
  })

  it("labels an Apple Maps fallback as Apple Maps on Android", () => {
    expect(externalMapsLink({ mapsUrl: "https://maps.apple.com/?q=Ichiran" }, ANDROID)).toEqual({
      href: "https://maps.apple.com/?q=Ichiran",
      app: "apple",
      label: "Open this place in Apple Maps",
    })
  })
})

describe("directionsLink", () => {
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
  const android = "Mozilla/5.0 (Linux; Android 14)"
  const hotel = { name: "Hotel Avenida", lat: 38.72, lng: -9.14 }
  const castle = { name: "Castelo", lat: 38.7139, lng: -9.1335 }

  it("opens Apple Maps directions on Apple devices for a single leg", () => {
    const link = directionsLink({ destination: castle, origin: hotel, mode: "walk" }, mac)
    expect(link?.app).toBe("apple")
    expect(link?.href).toBe("https://maps.apple.com/?daddr=38.7139%2C-9.1335&saddr=38.72%2C-9.14&dirflg=w")
  })

  it("opens Google Maps directions elsewhere, from the phone's location when no origin", () => {
    const link = directionsLink({ destination: castle }, android)
    expect(link?.href).toBe("https://www.google.com/maps/dir/?api=1&destination=38.7139%2C-9.1335&travelmode=transit")
  })

  it("routes a day through Google Maps with waypoints, even on Apple devices", () => {
    const link = directionsLink({ destination: hotel, origin: hotel, waypoints: [castle], mode: "walk" }, mac)
    expect(link?.app).toBe("google")
    expect(link?.href).toContain("waypoints=38.7139%2C-9.1335")
    expect(link?.href).toContain("travelmode=walking")
  })

  it("searches by name when there is no pin, and gives up with neither", () => {
    expect(directionsLink({ destination: { name: "Time Out Market", address: "Lisbon" } }, android)?.href).toContain(
      "destination=Time+Out+Market%2C+Lisbon",
    )
    expect(directionsLink({ destination: {} }, android)).toBeUndefined()
  })
})
