import { describe, expect, it } from "vitest"
import { matchZones, zoneParts } from "../timeZones"

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
