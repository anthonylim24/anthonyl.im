import { describe, expect, it } from "bun:test"
import { createRateLimit, userOrClientKey } from "../middleware/rateLimit"
import type { PlaceTypeahead } from "../trips/placeSearch"
import { createPlaceSearchRouter, parseNear } from "./placeSearch"

const verifyAuth = async (header: string | undefined) => (header === "Bearer ok" ? "user-1" : null)
const auth = { headers: { Authorization: "Bearer ok" } }

function recordingSearch(result: Awaited<ReturnType<PlaceTypeahead>> = []) {
  const calls: Array<Parameters<PlaceTypeahead>[0]> = []
  const search: PlaceTypeahead = async (args) => {
    calls.push(args)
    return result
  }
  return { search, calls }
}

describe("GET /api/places/search", () => {
  it("needs a signed-in user", async () => {
    const { search, calls } = recordingSearch()
    const app = createPlaceSearchRouter({ verifyAuth, search })
    const res = await app.request("/search?q=Gohan")
    expect(res.status).toBe(401)
    expect(calls.length).toBe(0)
  })

  it("passes the tidied query and the bias point through", async () => {
    const hit = { id: "g:1", name: "GOHAN", context: "1314 S King St Ste G3, Honolulu", lat: 21.29, lng: -157.83 }
    const { search, calls } = recordingSearch([hit])
    const app = createPlaceSearchRouter({ verifyAuth, search })
    const res = await app.request(`/search?q=${encodeURIComponent("  Gohan   Honolulu ")}&lat=21.3&lng=-157.86`, auth)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ places: [hit] })
    expect(calls[0]).toMatchObject({ query: "Gohan Honolulu", near: { lat: 21.3, lng: -157.86 } })
  })

  it("searches without a bias point", async () => {
    const { search, calls } = recordingSearch()
    const app = createPlaceSearchRouter({ verifyAuth, search })
    expect((await app.request("/search?q=Gohan", auth)).status).toBe(200)
    expect(calls[0]!.near).toBeNull()
  })

  it.each([
    ["/search", "no query"],
    ["/search?q=a", "one letter"],
    [`/search?q=${"x".repeat(121)}`, "too long"],
    ["/search?q=Gohan&lat=21.3", "half a point"],
    ["/search?q=Gohan&lat=91&lng=0", "off the globe"],
    ["/search?q=Gohan&lat=abc&lng=0", "not a number"],
  ])("refuses %s (%s)", async (path) => {
    const { search, calls } = recordingSearch()
    const app = createPlaceSearchRouter({ verifyAuth, search })
    expect((await app.request(path, auth)).status).toBe(400)
    expect(calls.length).toBe(0)
  })

  it("answers 503 without a Maps key, so the client keeps its own results", async () => {
    const app = createPlaceSearchRouter({ verifyAuth, search: null })
    const res = await app.request("/search?q=Gohan", auth)
    expect(res.status).toBe(503)
  })

  it("answers 502 when Google fails", async () => {
    const app = createPlaceSearchRouter({
      verifyAuth,
      search: async () => {
        throw new Error("places search 500")
      },
    })
    expect((await app.request("/search?q=Gohan", auth)).status).toBe(502)
  })

  it("has its own rate limit, keyed on the user", async () => {
    const { search } = recordingSearch()
    const app = createPlaceSearchRouter({
      verifyAuth,
      search,
      rateLimit: createRateLimit({ windowMs: 60_000, max: 2, keyPrefix: `places-test-${crypto.randomUUID()}`, key: userOrClientKey }),
    })
    expect((await app.request("/search?q=aa", auth)).status).toBe(200)
    expect((await app.request("/search?q=bb", auth)).status).toBe(200)
    expect((await app.request("/search?q=cc", auth)).status).toBe(429)
  })
})

describe("parseNear", () => {
  it("reads both or neither", () => {
    expect(parseNear(undefined, undefined)).toBeNull()
    expect(parseNear("21.3", "-157.86")).toEqual({ lat: 21.3, lng: -157.86 })
    expect(parseNear("21.3", undefined)).toBe("invalid")
    expect(parseNear("", "")).toBe("invalid")
    expect(parseNear("0", "181")).toBe("invalid")
    expect(parseNear("Infinity", "0")).toBe("invalid")
  })
})
