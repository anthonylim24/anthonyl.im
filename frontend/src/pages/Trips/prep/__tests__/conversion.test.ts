import { describe, expect, it } from "vitest"
import { converted, homeCurrency, rateReference } from "../conversion"

describe("homeCurrency", () => {
  it("is the money of the viewer's own country, read from their time zone", () => {
    expect(homeCurrency("America/Los_Angeles", {})).toBe("USD")
    expect(homeCurrency("Asia/Seoul", { budget: { currency: "EUR" } })).toBe("KRW")
  })

  it("falls back to the trip's budget currency, then US dollars", () => {
    expect(homeCurrency("UTC", { budget: { currency: "EUR" } })).toBe("EUR")
    expect(homeCurrency("UTC", {})).toBe("USD")
  })
})

describe("converted", () => {
  const rate = 0.00072 // US dollars per won

  it("works out the other side from what was typed", () => {
    expect(converted("10,000", "local", "KRW", "USD", rate)).toBe(7.2)
    expect(converted("7.20", "home", "KRW", "USD", rate)).toBe(10000)
  })

  it("rounds to the other currency's smallest unit", () => {
    expect(converted("1", "home", "KRW", "USD", rate)).toBe(1389)
    expect(converted("333", "local", "KRW", "USD", rate)).toBe(0.24)
  })

  it("is nothing for text that is not an amount yet", () => {
    expect(converted("", "local", "KRW", "USD", rate)).toBeNull()
    expect(converted("abc", "home", "KRW", "USD", rate)).toBeNull()
    expect(converted("-5", "home", "KRW", "USD", rate)).toBeNull()
  })
})

describe("rateReference", () => {
  it("quotes the smallest round amount worth a unit of home money", () => {
    expect(rateReference("KRW", "USD", 0.00072)).toBe("₩10,000 ≈ $7.20")
    expect(rateReference("JPY", "USD", 0.0067)).toBe("¥1,000 ≈ $6.70")
    expect(rateReference("EUR", "USD", 1.08)).toBe("€1 ≈ $1.08")
    expect(rateReference("USD", "KRW", 1390)).toBe("$1 ≈ ₩1,390")
  })
})
