import { describe, expect, it } from "vitest"
import { matchZones, resolveZone, zoneParts } from "../timeZones"

const zones = ["America/Argentina/Buenos_Aires", "America/New_York", "Asia/Seoul", "Asia/Tokyo", "Europe/Lisbon"]

describe("zoneParts", () => {
  it("reads the city and the region from an IANA name", () => {
    expect(zoneParts("America/Argentina/Buenos_Aires")).toEqual({ city: "Buenos Aires", region: "America · Argentina" })
    expect(zoneParts("UTC")).toEqual({ city: "UTC", region: "" })
  })
})

describe("matchZones", () => {
  it("puts zones whose city starts with the query first", () => {
    expect(matchZones(zones, "new y")).toEqual(["America/New_York"])
    expect(matchZones(zones, "a")).toEqual(["America/Argentina/Buenos_Aires", "America/New_York", "Asia/Seoul", "Asia/Tokyo"])
  })

  it("matches regions and ignores case, accents and underscores", () => {
    expect(matchZones(zones, "asia")).toEqual(["Asia/Seoul", "Asia/Tokyo"])
    expect(matchZones(zones, "LISBÓN")).toEqual(["Europe/Lisbon"])
    expect(matchZones(zones, "buenos_aires")).toEqual(["America/Argentina/Buenos_Aires"])
  })

  it("returns every zone for an empty query", () => {
    expect(matchZones(zones, "  ")).toEqual(zones)
  })
})

describe("resolveZone", () => {
  it("reads a zone by its name in any case, or by a city that names one", () => {
    expect(resolveZone("asia/tokyo", zones)).toBe("Asia/Tokyo")
    expect(resolveZone("new york", zones)).toBe("America/New_York")
    expect(resolveZone("buenos_aires", zones)).toBe("America/Argentina/Buenos_Aires")
  })

  it("names nothing for a city without its own zone, a partial name or nothing", () => {
    expect(resolveZone("Osaka", zones)).toBeNull()
    expect(resolveZone("tok", zones)).toBeNull()
    expect(resolveZone("  ", zones)).toBeNull()
  })
})
