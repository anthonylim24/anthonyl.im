import { describe, expect, it } from "vitest"
import { COUNTRIES } from "../countries"
import {
  countriesFor,
  countryForZone,
  formatLocalTime,
  formatMains,
  localZone,
  normalizePlace,
  plugsToAdapt,
  timeDifference,
  voltageDiffers,
  zoneCity,
  zoneOffsetMinutes,
} from "../essentials"

const codes = (destinations: string[], timezone = "UTC", cities: string[] = []) =>
  countriesFor({ destinations, timezone, days: cities.map((city) => ({ city })) }).map((c) => c.code)

describe("normalizePlace", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizePlace("Côte d’Azur")).toBe("cote dazur")
    expect(normalizePlace("Đà Nẵng")).toBe("da nang")
    expect(normalizePlace("Tromsø")).toBe("tromso")
    expect(normalizePlace("  São  Paulo ")).toBe("sao paulo")
    expect(normalizePlace("Washington, D.C.")).toBe("washington dc")
    expect(normalizePlace("서울")).toBe("서울")
  })
})

describe("countriesFor", () => {
  it("reads country and city names in a destination", () => {
    expect(codes(["South Korea — Seoul + Busan"])).toEqual(["KR"])
    expect(codes(["Kyoto"])).toEqual(["JP"])
    expect(codes(["Paris, Lyon"])).toEqual(["FR"])
    expect(codes(["서울", "부산"])).toEqual(["KR"])
    expect(codes(["Đà Nẵng"])).toEqual(["VN"])
    expect(codes(["Washington, D.C."])).toEqual(["US"])
  })

  it("keeps the order the trip names countries in", () => {
    expect(codes(["Rome / Florence & Paris"])).toEqual(["IT", "FR"])
    expect(codes(["Lisbon", "Madrid to Barcelona", "Porto"])).toEqual(["PT", "ES"])
    expect(codes(["Tokyo"], "Asia/Tokyo", ["Tokyo", "Seoul"])).toEqual(["JP", "KR"])
  })

  it("finds a country inside a longer phrase", () => {
    expect(codes(["Southern Italy"])).toEqual(["IT"])
    expect(codes(["Tokyo Japan"])).toEqual(["JP"])
    expect(codes(["Road trip through Northern Peru"])).toEqual(["PE"])
  })

  it("lets the longer name win", () => {
    expect(codes(["New Mexico"])).toEqual(["US"])
    expect(codes(["Northern New Mexico"])).toEqual(["US"])
    expect(codes(["New England"])).toEqual(["US"])
    expect(codes(["New South Wales"])).toEqual(["AU"])
    expect(codes(["Santiago de Compostela"])).toEqual(["ES"])
    expect(codes(["Santiago"])).toEqual(["CL"])
    expect(codes(["Northern Ireland"])).toEqual(["GB"])
  })

  it("does not guess at ambiguous or ordinary words", () => {
    expect(codes(["Georgia"])).toEqual([])
    expect(codes(["South America"])).toEqual([])
    expect(codes(["Nice weather somewhere"])).toEqual([])
    expect(codes(["Female-friendly retreat"])).toEqual([])
    expect(codes(["Saint-Tropez-ish"])).toEqual([])
    expect(codes([""])).toEqual([])
  })

  it("falls back to the trip's time zone", () => {
    expect(codes(["Somewhere lovely"], "Asia/Tokyo")).toEqual(["JP"])
    expect(codes([], "Asia/Calcutta")).toEqual(["IN"])
    expect(codes(["Somewhere lovely"], "UTC")).toEqual([])
    expect(codes([], "Not/AZone")).toEqual([])
  })
})

describe("localZone", () => {
  it("uses the trip's zone when it is in that country", () => {
    const trip = { destinations: ["Maui"], timezone: "Pacific/Honolulu" }
    expect(localZone(trip, COUNTRIES.US)).toBe("Pacific/Honolulu")
  })

  it("uses a named city's zone in a country that spans several", () => {
    const trip = { destinations: ["Tokyo", "Los Angeles"], timezone: "Asia/Tokyo" }
    expect(localZone(trip, COUNTRIES.US)).toBe("America/Los_Angeles")
    expect(localZone(trip, COUNTRIES.JP)).toBe("Asia/Tokyo")
  })

  it("falls back to the country's own zone", () => {
    expect(localZone({ destinations: ["France"], timezone: "UTC" }, COUNTRIES.FR)).toBe("Europe/Paris")
  })
})

describe("countryForZone", () => {
  it("knows legacy names browsers still report", () => {
    expect(countryForZone("Asia/Saigon")?.code).toBe("VN")
    expect(countryForZone("America/Los_Angeles")?.code).toBe("US")
    expect(countryForZone("Europe/Kyiv")).toBeUndefined()
    expect(countryForZone(undefined)).toBeUndefined()
  })
})

describe("time", () => {
  const july = new Date("2026-07-10T03:00:00Z")
  const january = new Date("2026-01-15T12:00:00Z")

  it("measures a zone's offset, daylight saving included", () => {
    expect(zoneOffsetMinutes("Asia/Seoul", july)).toBe(540)
    expect(zoneOffsetMinutes("America/Los_Angeles", july)).toBe(-420)
    expect(zoneOffsetMinutes("America/Los_Angeles", january)).toBe(-480)
    expect(zoneOffsetMinutes("Asia/Kathmandu", july)).toBe(345)
    expect(zoneOffsetMinutes("Not/AZone", july)).toBeNull()
  })

  it("says how far ahead or behind the trip is", () => {
    expect(timeDifference("Asia/Seoul", "America/Los_Angeles", july)).toEqual({ hours: 16, label: "16 h ahead of you" })
    expect(timeDifference("America/Los_Angeles", "Asia/Seoul", july)).toEqual({ hours: -16, label: "16 h behind you" })
    expect(timeDifference("Asia/Kolkata", "Europe/London", january)).toEqual({ hours: 5.5, label: "5 h 30 min ahead of you" })
    expect(timeDifference("Europe/London", "Asia/Kolkata", january)).toEqual({ hours: -5.5, label: "5 h 30 min behind you" })
    expect(timeDifference("Asia/Kathmandu", "Asia/Kolkata", july)).toEqual({ hours: 0.25, label: "15 min ahead of you" })
    expect(timeDifference("America/St_Johns", "UTC", january)?.label).toBe("3 h 30 min behind you")
    expect(timeDifference("Asia/Seoul", "Asia/Tokyo", july)).toEqual({ hours: 0, label: "Same time as you" })
    expect(timeDifference("Asia/Seoul", "Not/AZone", july)).toBeNull()
  })

  it("formats the local clock", () => {
    // ICU puts a narrow no-break space before "PM".
    expect(formatLocalTime("Asia/Seoul", july)).toMatch(/^Fri 12:00\sPM$/)
    expect(formatLocalTime("Not/AZone", july)).toBeNull()
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires")
  })
})

describe("plugs and mains", () => {
  it("lists the sockets a traveller's plugs don't fit", () => {
    expect(plugsToAdapt(COUNTRIES.US, COUNTRIES.KR)).toEqual(["C", "F"])
    expect(plugsToAdapt(COUNTRIES.DE, COUNTRIES.KR)).toEqual([])
    expect(plugsToAdapt(COUNTRIES.US, COUNTRIES.JP)).toEqual([])
    expect(plugsToAdapt(COUNTRIES.GB, COUNTRIES.FR)).toEqual(["C", "E"])
    expect(plugsToAdapt(COUNTRIES.US, COUNTRIES.MV)).toEqual([])
  })

  it("compares voltage bands", () => {
    expect(voltageDiffers(COUNTRIES.US, COUNTRIES.KR)).toBe(true)
    expect(voltageDiffers(COUNTRIES.US, COUNTRIES.JP)).toBe(false)
    expect(voltageDiffers(COUNTRIES.US, COUNTRIES.BR)).toBe(false)
  })

  it("formats mains", () => {
    expect(formatMains({ volts: [220], hertz: [60] })).toBe("220 V · 60 Hz")
    expect(formatMains({ volts: [100], hertz: [50, 60] })).toBe("100 V · 50 / 60 Hz")
  })
})
