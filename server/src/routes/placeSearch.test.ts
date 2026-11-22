import { describe, expect, it } from "bun:test"
import { createRateLimit, userOrClientKey } from "../middleware/rateLimit"
import {
  createGooglePlaceDetails,
  PlaceDetailsUpstreamError,
  type PlaceDetails,
  type PlaceDetailsLookup,
  type PlaceDetailsQuery,
} from "../trips/placeDetails"
import type { PlaceTypeahead } from "../trips/placeSearch"
import { createPlaceSearchRouter, parseDetailsQuery, parseNear } from "./placeSearch"

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

describe("GET /api/places/details", () => {
  const KEY = "test-maps-key-SECRET123"
  const PLACE_ID = "ChIJod7tSseifDUR9hXHLFNGMIs"
  const place: PlaceDetails = {
    placeId: PLACE_ID,
    name: "Gyeongbokgung Palace",
    rating: 4.6,
    photos: [{ url: "https://lh3.googleusercontent.com/p/abc=s1200", author: { name: "아삭" } }],
  }

  function recordingDetails(result: PlaceDetails | null = place) {
    const calls: PlaceDetailsQuery[] = []
    const details: PlaceDetailsLookup = async (query) => {
      calls.push(query)
      return result
    }
    return { details, calls }
  }

  /** Runs `fn` with console.warn captured. */
  async function withWarnings<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: string }> {
    const original = console.warn
    const lines: string[] = []
    console.warn = (...args: unknown[]) => lines.push(args.map(String).join(" "))
    try {
      return { result: await fn(), warnings: lines.join("\n") }
    } finally {
      console.warn = original
    }
  }

  it("needs a signed-in user", async () => {
    const { details, calls } = recordingDetails()
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details })
    expect((await app.request(`/details?placeId=${PLACE_ID}`)).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it("looks a place up by id", async () => {
    const { details, calls } = recordingDetails()
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details })
    const res = await app.request(`/details?placeId=${PLACE_ID}`, auth)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ place })
    expect(calls[0]).toEqual({ placeId: PLACE_ID })
  })

  it("looks a place up by its name at a point", async () => {
    const { details, calls } = recordingDetails(null)
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details })
    const res = await app.request(`/details?name=${encodeURIComponent("  Tosokchon   Samgyetang ")}&lat=37.578&lng=126.971`, auth)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ place: null })
    expect(calls[0]).toEqual({ name: "Tosokchon Samgyetang", near: { lat: 37.578, lng: 126.971 } })
  })

  it.each([
    ["/details", "nothing"],
    ["/details?placeId=../../places:searchText", "a path in the id"],
    ["/details?placeId=short", "too short an id"],
    ["/details?name=Tosokchon", "a name with no point"],
    ["/details?name=%20%20&lat=37&lng=126", "a blank name"],
    [`/details?name=${"x".repeat(201)}&lat=37&lng=126`, "too long a name"],
    ["/details?name=Tosokchon&lat=91&lng=0", "off the globe"],
  ])("refuses %s (%s)", async (path) => {
    const { details, calls } = recordingDetails()
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details })
    expect((await app.request(path, auth)).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it("answers 503 without a Maps key", async () => {
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details: null })
    const res = await app.request(`/details?placeId=${PLACE_ID}`, auth)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "place details unavailable" })
  })

  it("answers 502 when Google refuses, and logs only the status", async () => {
    const app = createPlaceSearchRouter({
      verifyAuth,
      search: null,
      details: async () => {
        throw new PlaceDetailsUpstreamError(403)
      },
    })
    const { result: res, warnings } = await withWarnings(() => app.request(`/details?placeId=${PLACE_ID}`, auth))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "place details failed" })
    expect(warnings).toContain("upstream 403")
  })

  it("never lets the key out: not in an answer, an error, or a log line", async () => {
    // A real lookup over a fake Google whose network error quotes a URL with the key in it.
    const google = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/media?")) return Response.json({ photoUri: "https://lh3.googleusercontent.com/p/abc=s1200" })
      if (url.includes("/places/ChIJbroken")) throw new TypeError(`Unable to connect to ${url}&key=${KEY}`)
      return Response.json({ id: PLACE_ID, displayName: { text: "Gyeongbokgung Palace" }, photos: [{ name: `places/${PLACE_ID}/photos/AV-0GLphoto0001` }] })
    }) as typeof fetch
    const app = createPlaceSearchRouter({ verifyAuth, search: null, details: createGooglePlaceDetails(KEY, google) })

    const ok = await app.request(`/details?placeId=${PLACE_ID}`, auth)
    expect(ok.status).toBe(200)
    const okBody = await ok.text()
    expect(okBody).toContain("lh3.googleusercontent.com")
    expect(okBody).not.toContain(KEY)

    const { result: failed, warnings } = await withWarnings(() => app.request("/details?placeId=ChIJbrokenPlaceId00", auth))
    expect(failed.status).toBe(502)
    expect(await failed.text()).not.toContain(KEY)
    expect(warnings).toContain("[places] details failed")
    expect(warnings).not.toContain(KEY)
  })

  it("has its own, tighter bucket, separate from search's", async () => {
    const { details } = recordingDetails()
    const { search } = recordingSearch()
    const app = createPlaceSearchRouter({
      verifyAuth,
      search,
      details,
      rateLimit: createRateLimit({ windowMs: 60_000, max: 1, keyPrefix: `places-test-${crypto.randomUUID()}`, key: userOrClientKey }),
      detailsRateLimit: createRateLimit({ windowMs: 600_000, max: 2, keyPrefix: `details-test-${crypto.randomUUID()}`, key: userOrClientKey }),
    })
    expect((await app.request("/search?q=aa", auth)).status).toBe(200)
    expect((await app.request("/search?q=bb", auth)).status).toBe(429)
    expect((await app.request(`/details?placeId=${PLACE_ID}`, auth)).status).toBe(200)
    expect((await app.request(`/details?placeId=${PLACE_ID}`, auth)).status).toBe(200)
    expect((await app.request(`/details?placeId=${PLACE_ID}`, auth)).status).toBe(429)
  })
})

describe("parseDetailsQuery", () => {
  const id = "ChIJod7tSseifDUR9hXHLFNGMIs"

  it("takes the place id, keeping the name and point to fall back on", () => {
    expect(parseDetailsQuery(id, "Gyeongbokgung", "37.5", "126.9")).toEqual({ placeId: id, fallback: { name: "Gyeongbokgung", near: { lat: 37.5, lng: 126.9 } } })
    expect(parseDetailsQuery(id, undefined, undefined, undefined)).toEqual({ placeId: id })
    expect(parseDetailsQuery(`places/${id}`, undefined, undefined, undefined)).toEqual({ placeId: id })
  })

  it("lets an id that is not Google's shape give way to the name and point", () => {
    expect(parseDetailsQuery("osm:node/123", "숲", "37.5", "126.9")).toEqual({ name: "숲", near: { lat: 37.5, lng: 126.9 } })
    expect(parseDetailsQuery("osm:node/123", undefined, undefined, undefined)).toBe("placeId is not a Google place id")
  })
})
