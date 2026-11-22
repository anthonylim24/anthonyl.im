import { describe, expect, it } from "vitest"
import { setIdeaTheme } from "../../tripEdits"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

const tram = makeItem({ id: "tram", title: "Tram 28" })
const belem = makeItem({ id: "belem", title: "Belém", theme: "food" })

describe("setIdeaTheme", () => {
  it("files one idea under a category and leaves the rest alone", () => {
    const trip = makeTrip({ ideas: [tram, belem] })
    const next = setIdeaTheme(trip, "tram", "sights")
    expect(next.ideas?.map((idea) => idea.theme)).toEqual(["sights", "food"])
    expect(next.ideas?.[1]).toBe(belem)
    expect(trip.ideas?.[0]).not.toHaveProperty("theme")
  })

  it("goes back to automatic by removing the key, not by setting it to undefined", () => {
    const next = setIdeaTheme(makeTrip({ ideas: [belem] }), "belem", null)
    expect(next.ideas?.[0]).not.toHaveProperty("theme")
    expect(Object.keys(next.ideas![0]!)).not.toContain("theme")
  })

  it("returns the same trip when nothing changes, so no empty undo step is kept", () => {
    const trip = makeTrip({ ideas: [tram, belem] })
    expect(setIdeaTheme(trip, "belem", "food")).toBe(trip)
    expect(setIdeaTheme(trip, "tram", null)).toBe(trip)
    expect(setIdeaTheme(trip, "missing", "food")).toBe(trip)
    expect(setIdeaTheme(makeTrip(), "tram", "food").ideas).toBeUndefined()
  })
})
