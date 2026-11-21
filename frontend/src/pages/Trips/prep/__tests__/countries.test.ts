import { describe, expect, it } from "vitest"
import { COUNTRIES, EXTRA_ZONES, PLACES, isCountryCode, type CountryCode } from "../countries"
import { countryForZone, normalizePlace } from "../essentials"

// The facts table is data a person maintains by hand: these checks catch a
// typo before it reaches a traveller.

const countries = Object.values(COUNTRIES)
const regions = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" })
const currencies = new Intl.DisplayNames(["en"], { type: "currency", fallback: "none" })

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

describe("COUNTRIES", () => {
  it("covers about seventy countries, each under its own ISO code", () => {
    expect(countries.length).toBeGreaterThanOrEqual(65)
    for (const [code, country] of Object.entries(COUNTRIES)) {
      expect(country.code).toBe(code)
      expect(regions.of(code), code).toBeTruthy()
    }
  })

  it("names real currencies", () => {
    for (const country of countries) {
      expect(country.currency.code, country.code).toMatch(/^[A-Z]{3}$/)
      expect(currencies.of(country.currency.code), country.code).toBeTruthy()
      expect(country.currency.name.trim(), country.code).not.toBe("")
    }
  })

  it("keeps each field in its shape", () => {
    for (const country of countries) {
      for (const plug of country.plugs ?? []) expect(plug, country.code).toMatch(/^[A-O]$/)
      for (const v of country.power?.volts ?? []) expect(v, country.code).toBeGreaterThanOrEqual(100)
      for (const hz of country.power?.hertz ?? []) expect([50, 60], country.code).toContain(hz)
      for (const call of country.emergency ?? []) expect(call.number, country.code).toMatch(/^\d{2,5}$/)
      if (country.callingCode) expect(country.callingCode, country.code).toMatch(/^\+\d/)
      expect(validZone(country.zone), country.zone).toBe(true)
      expect(country.tipping ?? "", country.code).not.toMatch(/!/)
    }
  })

  it("rejects codes it does not hold", () => {
    expect(isCountryCode("KR")).toBe(true)
    expect(isCountryCode("XX")).toBe(false)
    expect(isCountryCode("toString")).toBe(false)
  })
})

describe("PLACES and zones", () => {
  it("point at countries in the table, with zones that exist there", () => {
    for (const [place, value] of Object.entries(PLACES)) {
      const [code, zone] = typeof value === "string" ? [value, undefined] : value
      expect(isCountryCode(code), place).toBe(true)
      if (zone) {
        expect(validZone(zone), `${place}: ${zone}`).toBe(true)
        expect(COUNTRIES[code as CountryCode].multiZone, `${place} has a zone but ${code} is one zone`).toBe(true)
      }
    }
    for (const [zone, code] of Object.entries(EXTRA_ZONES)) {
      expect(validZone(zone), zone).toBe(true)
      expect(isCountryCode(code), zone).toBe(true)
      expect(countryForZone(zone)?.code).toBe(code)
    }
  })

  it("never gives one name to two countries", () => {
    const owner = new Map<string, CountryCode>()
    const claim = (name: string, code: CountryCode) => {
      const key = normalizePlace(name)
      expect(owner.get(key) ?? code, `"${name}"`).toBe(code)
      owner.set(key, code)
    }
    for (const country of countries) for (const name of [country.name, ...(country.aliases ?? [])]) claim(name, country.code)
    for (const [place, value] of Object.entries(PLACES)) claim(place, typeof value === "string" ? value : value[0])
  })

  it("maps every country's own zone back to it", () => {
    for (const country of countries) expect(countryForZone(country.zone)?.code, country.zone).toBe(country.code)
  })
})
