import { describe, expect, it } from "vitest"
import { tripsPageAt } from "../routePages"

describe("tripsPageAt", () => {
  it("names the page each Trips route renders", () => {
    expect(tripsPageAt("/trips")).toBe("index")
    expect(tripsPageAt("/trips/")).toBe("index")
    expect(tripsPageAt("/trips/new")).toBe("create")
    expect(tripsPageAt("/trips/join/abc123")).toBe("join")
    expect(tripsPageAt("/trips/korea-2026")).toBe("trip")
    expect(tripsPageAt("/trips/korea-2026/day/day-3")).toBe("trip")
    // `join` with no token is a trip id, as the router reads it.
    expect(tripsPageAt("/trips/join")).toBe("trip")
  })

  it("names nothing for redirects, unknown paths and other apps", () => {
    expect(tripsPageAt("/trips/korea-2026/edit")).toBeNull()
    expect(tripsPageAt("/trips/korea-2026/places")).toBeNull()
    expect(tripsPageAt("/trips/a/b/c")).toBeNull()
    expect(tripsPageAt("/breathwork")).toBeNull()
    expect(tripsPageAt("/tripsx")).toBeNull()
  })
})
