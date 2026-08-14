import { describe, expect, it } from "vitest"
import { asConciergePlace, placeCanBeAdded, visibleConciergeText } from "../conciergeGrounding"

describe("visibleConciergeText", () => {
  it("strips a complete add-places trailer", () => {
    expect(visibleConciergeText("Try Ichiran.\n:::add-places\n[]\n:::")).toBe("Try Ichiran.")
  })

  it("hides a partial fence at the end of a stream", () => {
    expect(visibleConciergeText("Try Ichiran.\n:::")).toBe("Try Ichiran.")
  })
})

describe("asConciergePlace", () => {
  it("requires a name and rejects javascript urls", () => {
    expect(asConciergePlace({ mapsUrl: "https://maps.google.com" })).toBeNull()
    expect(asConciergePlace({ name: "X", mapsUrl: "javascript:alert(1)" })).toEqual({ name: "X" })
    expect(placeCanBeAdded({ name: "X", address: "1 Main" })).toBe(true)
    expect(placeCanBeAdded({ name: "X" })).toBe(false)
  })
})
