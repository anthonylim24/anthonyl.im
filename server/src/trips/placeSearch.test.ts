import { describe, expect, it } from "bun:test"
import { createGooglePlaceTypeahead, toPlaceHit } from "./placeSearch"

const gohan = {
  id: "ChIJgohan",
  displayName: { text: "GOHAN" },
  formattedAddress: "1314 S King St Ste G3, Honolulu, HI 96814, USA",
  shortFormattedAddress: "1314 S King St Ste G3, Honolulu",
  location: { latitude: 21.2978, longitude: -157.8367 },
  primaryType: "restaurant",
  types: ["restaurant", "food"],
  businessStatus: "OPERATIONAL",
}

function fakeFetch(places: unknown[], status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ places }), { status, headers: { "Content-Type": "application/json" } })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe("toPlaceHit", () => {
  it("keeps the short address to tell results apart and the full one to save", () => {
    expect(toPlaceHit(gohan)).toEqual({
      id: "g:ChIJgohan",
      name: "GOHAN",
      context: "1314 S King St Ste G3, Honolulu",
      address: "1314 S King St Ste G3, Honolulu, HI 96814, USA",
      lat: 21.2978,
      lng: -157.8367,
      category: "restaurant",
      placeId: "ChIJgohan",
    })
  })

  it("drops places without a name or a point, and places that closed for good", () => {
    expect(toPlaceHit({ ...gohan, displayName: { text: "  " } })).toBeNull()
    expect(toPlaceHit({ ...gohan, location: {} })).toBeNull()
    expect(toPlaceHit({ ...gohan, businessStatus: "CLOSED_PERMANENTLY" })).toBeNull()
    expect(toPlaceHit({ ...gohan, businessStatus: "CLOSED_TEMPORARILY" })).not.toBeNull()
  })

  it("falls back to whichever address exists", () => {
    const { formattedAddress: _full, ...shortOnly } = gohan
    expect(toPlaceHit(shortOnly)).toMatchObject({ context: "1314 S King St Ste G3, Honolulu", address: "1314 S King St Ste G3, Honolulu" })
    const { formattedAddress: _f, shortFormattedAddress: _s, ...none } = gohan
    const hit = toPlaceHit(none)!
    expect(hit.context).toBe("")
    expect("address" in hit).toBe(false)
  })
})

describe("createGooglePlaceTypeahead", () => {
  it("biases toward the trip and asks only for the fields a suggestion needs", async () => {
    const { impl, calls } = fakeFetch([gohan])
    const search = createGooglePlaceTypeahead("key", impl)
    const hits = await search({ query: "Gohan", near: { lat: 21.3, lng: -157.86 } })
    expect(hits.map((h) => h.name)).toEqual(["GOHAN"])

    const { url, init } = calls[0]!
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText")
    const headers = init.headers as Record<string, string>
    expect(headers["X-Goog-Api-Key"]).toBe("key")
    expect(headers["X-Goog-FieldMask"]).toContain("places.location")
    expect(headers["X-Goog-FieldMask"]).not.toContain("rating")
    expect(headers["X-Goog-FieldMask"]).not.toContain("regularOpeningHours")
    const body = JSON.parse(String(init.body))
    expect(body.textQuery).toBe("Gohan")
    expect(body.locationBias.circle).toEqual({ center: { latitude: 21.3, longitude: -157.86 }, radius: 50_000 })
  })

  it("sends no bias without a point", async () => {
    const { impl, calls } = fakeFetch([])
    await createGooglePlaceTypeahead("key", impl)({ query: "Gohan", near: null })
    expect(JSON.parse(String(calls[0]!.init.body)).locationBias).toBeUndefined()
  })

  it("answers a repeat from the cache until it goes stale", async () => {
    const { impl, calls } = fakeFetch([gohan])
    let clock = 0
    const search = createGooglePlaceTypeahead("key", impl, { ttlMs: 1_000, now: () => clock })
    await search({ query: "Gohan", near: { lat: 21.301, lng: -157.861 } })
    // Same words in another case, a bias point within the same rounding.
    await search({ query: "gohan", near: { lat: 21.302, lng: -157.858 } })
    expect(calls.length).toBe(1)
    clock = 1_001
    await search({ query: "Gohan", near: { lat: 21.301, lng: -157.861 } })
    expect(calls.length).toBe(2)
  })

  it("keeps the cache bounded", async () => {
    const { impl, calls } = fakeFetch([gohan])
    const search = createGooglePlaceTypeahead("key", impl, { maxEntries: 2 })
    for (const query of ["aa", "bb", "cc"]) await search({ query, near: null })
    await search({ query: "aa", near: null })
    expect(calls.length).toBe(4)
  })

  it("rejects on an error status and caches nothing", async () => {
    const { impl, calls } = fakeFetch([], 429)
    const search = createGooglePlaceTypeahead("key", impl)
    await expect(search({ query: "Gohan", near: null })).rejects.toThrow(/429/)
    await expect(search({ query: "Gohan", near: null })).rejects.toThrow(/429/)
    expect(calls.length).toBe(2)
  })
})
