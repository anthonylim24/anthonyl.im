import { describe, expect, it } from "vitest"
import { asConciergePlace, placeCanBeAdded, visibleConciergeText } from "../conciergeGrounding"

describe("visibleConciergeText", () => {
  it("strips a complete add-places trailer", () => {
    expect(visibleConciergeText("Try Ichiran.\n:::add-places\n[]\n:::")).toBe("Try Ichiran.")
  })

  it("hides a partial fence at the end of a stream", () => {
    expect(visibleConciergeText("Try Ichiran.\n:::")).toBe("Try Ichiran.")
    expect(visibleConciergeText("Try Ichiran.\n:::add-pla")).toBe("Try Ichiran.")
  })

  it("keeps unrelated triple-colon text", () => {
    expect(visibleConciergeText("See ::: docs")).toBe("See ::: docs")
    expect(visibleConciergeText("ratio 1:::2")).toBe("ratio 1:::2")
  })
})

describe("asConciergePlace", () => {
  it("requires a name and rejects javascript urls", () => {
    expect(asConciergePlace({ mapsUrl: "https://maps.google.com" })).toBeNull()
    expect(asConciergePlace({ name: "X", mapsUrl: "javascript:alert(1)" })).toEqual({ name: "X" })
    expect(asConciergePlace({ name: "X", lat: "", lng: " " })).toEqual({ name: "X" })
    expect(asConciergePlace({ name: "X", category: "spaceship", placeId: "nope" })).toEqual({ name: "X" })
    expect(asConciergePlace({ name: "X", category: "Cafe", placeId: "places/ChIJabcdefgh" })).toEqual({
      name: "X",
      category: "cafe",
      placeId: "ChIJabcdefgh",
    })
    expect(placeCanBeAdded({ name: "X", address: "1 Main" })).toBe(true)
    expect(placeCanBeAdded({ name: "X" })).toBe(false)
  })
})
