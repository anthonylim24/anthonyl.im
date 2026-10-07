import { describe, expect, it } from "vitest"
import { lookupPlace } from "../scene/worldMap"

describe("lookupPlace", () => {
  it("finds a known city inside a longer destination", () => {
    expect(lookupPlace("Seoul, South Korea")).toEqual({ lat: 37.57, lng: 126.98 })
  })

  it("matches whole words only", () => {
    expect(lookupPlace("Busanville")).toBeNull()
  })
})
