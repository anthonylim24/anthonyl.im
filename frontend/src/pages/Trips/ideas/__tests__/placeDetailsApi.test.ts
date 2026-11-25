import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeItem } from "../../__tests__/tripFixtures"
import type { PlaceDetails } from "../contract"
import {
  artistName,
  cachedPlaceDetails,
  cleanDetails,
  clearPlaceDetailsCache,
  detailsTarget,
  KEPT_PLACES,
  loadPlaceDetails,
  PlaceDetailsError,
  titleMatches,
  type DetailsTarget,
} from "../placeDetailsApi"

const getToken = async () => "test-token"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const palace: PlaceDetails = {
  placeId: "ChIJod7tSseifDUR9hXHLFNGMIs",
  name: "Gyeongbokgung Palace",
  summary: "A large royal palace.",
  summarySource: "google",
  rating: 4.6,
  photos: [{ url: "https://lh3.googleusercontent.com/p/abc=s1200", author: { name: "아삭", uri: "https://maps.google.com/maps/contrib/1" } }],
}

const at = { lat: 37.5796, lng: 126.977 }
const place = (overrides: Parameters<typeof makeItem>[0] = {}) =>
  makeItem({ title: "Gyeongbokgung", location: { name: "Gyeongbokgung", ...at, source: "user" }, ...overrides })

/** Wikipedia's Action API, by the query it is asked. */
function wikipedia(url: string): Response {
  const params = new URL(url).searchParams
  if (params.get("list") === "geosearch") {
    return json({ query: { geosearch: [{ pageid: 2, title: "Sajeongjeon" }, { pageid: 599683, title: "Gyeongbokgung" }] } })
  }
  if (params.get("generator") === "images") {
    return json({
      query: {
        pages: [
          {
            title: "File:광화문 월대.jpg",
            imageinfo: [{ mime: "image/jpeg", width: 6512, thumburl: "https://upload.wikimedia.org/lead.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Lead.jpg", extmetadata: { Artist: { value: "서울관광 아카이브" } } }],
          },
          {
            title: "File:Gyeonghoeru pavilion.jpg",
            imageinfo: [{ mime: "image/jpeg", width: 4000, thumburl: "https://upload.wikimedia.org/pavilion.jpg", thumbwidth: 1200, thumbheight: 800, descriptionurl: "https://commons.wikimedia.org/wiki/File:Pavilion.jpg", extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Yoonj">Yoonj</a>' } } }],
          },
          { title: "File:Palace map.jpg", imageinfo: [{ mime: "image/jpeg", width: 3000, thumburl: "https://upload.wikimedia.org/map.jpg" }] },
          { title: "File:Logo.svg", imageinfo: [{ mime: "image/svg+xml", width: 3000, thumburl: "https://upload.wikimedia.org/logo.png" }] },
          { title: "File:Small.jpg", imageinfo: [{ mime: "image/jpeg", width: 640, thumburl: "https://upload.wikimedia.org/small.jpg" }] },
        ],
      },
    })
  }
  return json({
    query: {
      pages: [
        {
          title: "Gyeongbokgung",
          extract: "Gyeongbokgung is a former royal palace in Seoul.",
          fullurl: "https://en.wikipedia.org/wiki/Gyeongbokgung",
          pageimage: "광화문_월대.jpg",
          thumbnail: { source: "https://thumb.wikimedia.org/lead-1200.jpg", width: 1200, height: 800 },
        },
      ],
    },
  })
}

/** `fetch` answering /api/places/details with `server`, and Wikipedia from fixtures. */
function stubFetch(server: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes("/api/places/details")) return server()
    if (url.startsWith("https://en.wikipedia.org/")) return wikipedia(url)
    throw new Error(`unexpected fetch ${url}`)
  })
}

const urls = (spy: ReturnType<typeof stubFetch>) => spy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input))

beforeEach(() => clearPlaceDetailsCache())
afterEach(() => vi.restoreAllMocks())

describe("detailsTarget", () => {
  it("prefers the place id", () => {
    const target = detailsTarget(place({ location: { name: "Gyeongbokgung", ...at, placeId: "ChIJod7tSseifDUR9hXHLFNGMIs", source: "user" } }))
    expect(target).toMatchObject({ place: "id:ChIJod7tSseifDUR9hXHLFNGMIs", key: "id:ChIJod7tSseifDUR9hXHLFNGMIs", placeId: "ChIJod7tSseifDUR9hXHLFNGMIs", business: false })
  })

  it("keys a pinned idea by its name and rounded point", () => {
    expect(detailsTarget(place())?.key).toBe("at:gyeongbokgung|37.5796,126.9770")
  })

  it("is another lookup once the idea is filed as a business, for the same place", () => {
    const sight = detailsTarget(place())!
    const food = detailsTarget(place({ theme: "food" }))!
    expect(food.place).toBe(sight.place)
    expect(food.key).not.toBe(sight.key)
  })

  it("has nothing to look up without a place id or a point", () => {
    expect(detailsTarget(makeItem({ title: "Try the hotteok", notes: "Somewhere in Insadong" }))).toBeNull()
    expect(detailsTarget(makeItem({ title: "X", location: { name: "X", address: "1 Main St", source: "user" } }))).toBeNull()
  })

  it.each([
    [{ category: "restaurant" }, undefined, true],
    [{ category: "cafe" }, undefined, true],
    [{ category: "hotel" }, undefined, true],
    [{}, "food" as const, true],
    [{}, "nightlife" as const, true],
    [{ category: "palace" }, undefined, false],
    [{ category: "park" }, "nature" as const, false],
  ])("reads %o with theme %s as business: %s", (extra, theme, business) => {
    const item = place({ theme, location: { name: "Somewhere", ...at, source: "user", ...extra } })
    expect(detailsTarget(item)?.business).toBe(business)
  })
})

describe("titleMatches", () => {
  it.each([
    ["Gyeongbokgung", "Gyeongbokgung"],
    ["Gyeongbokgung Palace", "Gyeongbokgung"],
    ["Bukchon Hanok Village", "Bukchon Hanok Village"],
    ["N Seoul Tower", "N Seoul Tower"],
    ["Sagrada Família", "Sagrada Familia"],
    ["Hyde Park", "Hyde Park (London)"],
  ])("finds %s in %s", (name, title) => {
    expect(titleMatches(name, title)).toBe(true)
  })

  it.each([
    ["Gyeongbokgung Palace", "Sajeongjeon"],
    ["Seoul", "Seoul Station"],
    ["Park", "Hyde Park"],
    ["Onion Anguk", "Anguk station"],
    ["경복궁", "Gyeongbokgung"],
  ])("does not take %s for %s", (name, title) => {
    expect(titleMatches(name, title)).toBe(false)
  })
})

describe("artistName", () => {
  it("reads the visible name out of Commons' HTML", () => {
    expect(artistName('<a href="//commons.wikimedia.org/wiki/User:Yoonj">Yoonj</a>')).toBe("Yoonj")
    expect(artistName("Unknown author<span style=\"display: none;\">Unknown author</span>")).toBeUndefined()
    expect(artistName(undefined)).toBeUndefined()
  })
})

describe("cleanDetails", () => {
  it("keeps https photos and web links only", () => {
    const clean = cleanDetails({
      name: "X",
      website: "javascript:alert(1)",
      mapsUrl: "https://maps.google.com/?cid=1",
      photos: [{ url: "http://insecure/p.jpg" }, { url: "https://ok/p.jpg", author: { name: "A", uri: "data:text/html,x" } }, null],
    })
    expect(clean).toEqual({ name: "X", mapsUrl: "https://maps.google.com/?cid=1", photos: [{ url: "https://ok/p.jpg", author: { name: "A" } }] })
    expect(cleanDetails(null)).toBeNull()
    expect(cleanDetails({ photos: [] })).toBeNull()
  })

  it("keeps only well-formed facts, and nothing it does not know", () => {
    const clean = cleanDetails({
      name: " X ",
      rating: "4.5",
      ratingCount: -3,
      priceLevel: 2.5,
      hours: ["Monday: 9–5", 7, "  "],
      phone: 12345,
      typeLabel: " Museum ",
      summarySource: "blog",
      address: "",
      surprise: { nested: true },
      photos: [],
    })
    expect(clean).toEqual({ name: "X", typeLabel: "Museum", hours: ["Monday: 9–5"], photos: [] })
    expect(cleanDetails({ name: "Y", rating: Number.NaN, photos: [] })?.rating).toBeUndefined()
    expect(cleanDetails({ name: "Y", rating: 6, photos: [] })?.rating).toBeUndefined()
    expect(cleanDetails({ name: "Y", rating: 4.4, ratingCount: 120, priceLevel: 0, photos: [] })).toMatchObject({ rating: 4.4, ratingCount: 120, priceLevel: 0 })
  })
})

describe("loadPlaceDetails", () => {
  const byId: DetailsTarget = { place: "id:ChIJod7tSseifDUR9hXHLFNGMIs", key: "id:ChIJod7tSseifDUR9hXHLFNGMIs", name: "Gyeongbokgung", placeId: "ChIJod7tSseifDUR9hXHLFNGMIs", point: at, business: false }

  it("asks the server by place id, with the token", async () => {
    const spy = stubFetch(() => json({ place: palace }))
    expect(await loadPlaceDetails(getToken, byId)).toEqual(palace)
    const [input, init] = spy.mock.calls[0]!
    const url = new URL(String(input), "https://example.test")
    expect(url.pathname).toContain("/api/places/details")
    // The name and point ride along, so a stale id still finds the place.
    expect(Object.fromEntries(url.searchParams)).toEqual({ placeId: "ChIJod7tSseifDUR9hXHLFNGMIs", name: "Gyeongbokgung", lat: "37.5796", lng: "126.977" })
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token")
  })

  it("asks by name and point when there is no id", async () => {
    const spy = stubFetch(() => json({ place: palace }))
    await loadPlaceDetails(getToken, detailsTarget(place())!)
    const url = new URL(urls(spy)[0]!, "https://example.test")
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: "Gyeongbokgung", lat: "37.5796", lng: "126.977" })
  })

  it("keeps the last 200 places' answers, dropping the oldest", async () => {
    stubFetch(() => json({ place: palace }))
    const target = (n: number): DetailsTarget => ({ ...byId, place: `id:p${n}`, key: `id:p${n}`, placeId: `p${n}` })
    for (let n = 0; n <= KEPT_PLACES; n++) await loadPlaceDetails(getToken, target(n))
    expect(cachedPlaceDetails(target(0))).toBeUndefined()
    expect(cachedPlaceDetails(target(1))).toEqual(palace)
    expect(cachedPlaceDetails(target(KEPT_PLACES))).toEqual(palace)
  })

  it("keeps the answer for the session", async () => {
    const spy = stubFetch(() => json({ place: palace }))
    await loadPlaceDetails(getToken, byId)
    await loadPlaceDetails(getToken, byId)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(cachedPlaceDetails(byId)).toEqual(palace)
  })

  it("falls back to the nearby Wikipedia article when Google has nothing", async () => {
    const spy = stubFetch(() => json({ place: null }))
    const details = await loadPlaceDetails(getToken, detailsTarget(place())!)
    expect(details).toEqual({
      name: "Gyeongbokgung",
      summary: "Gyeongbokgung is a former royal palace in Seoul.",
      summarySource: "wikipedia",
      summaryUrl: "https://en.wikipedia.org/wiki/Gyeongbokgung",
      photos: [
        { url: "https://thumb.wikimedia.org/lead-1200.jpg", width: 1200, height: 800, author: { name: "서울관광 아카이브", uri: "https://commons.wikimedia.org/wiki/File:Lead.jpg" } },
        { url: "https://upload.wikimedia.org/pavilion.jpg", width: 1200, height: 800, author: { name: "Yoonj", uri: "https://commons.wikimedia.org/wiki/File:Pavilion.jpg" } },
      ],
    })
    const geo = new URL(urls(spy).find((url) => url.includes("geosearch"))!)
    expect(geo.searchParams.get("gscoord")).toBe("37.5796|126.977")
  })

  it("lets the answer lapse after a while, then asks again", async () => {
    const full = { ...palace, photos: Array.from({ length: 6 }, (_, i) => ({ url: `https://lh3.googleusercontent.com/p/${i}=s1200` })) }
    const spy = stubFetch(() => json({ place: full }))
    await loadPlaceDetails(getToken, byId)
    expect(cachedPlaceDetails(byId, Date.now() + 24 * 60_000)).toEqual(full)
    expect(cachedPlaceDetails(byId, Date.now() + 26 * 60_000)).toBeUndefined()
    await loadPlaceDetails(getToken, byId)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("treats a refused id (400) as nothing known, and tries Wikipedia", async () => {
    stubFetch(() => json({ error: "placeId is not a Google place id" }, 400))
    expect((await loadPlaceDetails(getToken, detailsTarget(place())!))?.summarySource).toBe("wikipedia")
  })

  it("falls back to Wikipedia when the server has no Maps key (503)", async () => {
    stubFetch(() => json({ error: "place details unavailable" }, 503))
    expect((await loadPlaceDetails(getToken, detailsTarget(place())!))?.summarySource).toBe("wikipedia")
  })

  it("never asks Wikipedia about a business", async () => {
    const spy = stubFetch(() => json({ place: null }))
    const cafe = place({ title: "Onion Anguk", location: { name: "Onion Anguk", ...at, category: "cafe", source: "user" } })
    expect(await loadPlaceDetails(getToken, detailsTarget(cafe)!)).toBeNull()
    expect(urls(spy).some((url) => url.includes("wikipedia"))).toBe(false)
  })

  it("answers null when no nearby article names the place", async () => {
    stubFetch(() => json({ place: null }))
    const elsewhere = place({ title: "Changdeokgung", location: { name: "Changdeokgung", ...at, source: "user" } })
    expect(await loadPlaceDetails(getToken, detailsTarget(elsewhere)!)).toBeNull()
  })

  it("answers null, not an error, when Wikipedia fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/places/details")) return json({ place: null })
      throw new TypeError("Failed to fetch")
    })
    expect(await loadPlaceDetails(getToken, detailsTarget(place())!)).toBeNull()
  })

  it.each([
    [429, "Too many places looked up"],
    [502, "Couldn’t load this place’s details"],
    [401, "Sign in again"],
  ])("fails with a sentence on %i, and keeps nothing", async (status, sentence) => {
    stubFetch(() => json({ error: "nope" }, status))
    const err = await loadPlaceDetails(getToken, byId).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PlaceDetailsError)
    expect((err as PlaceDetailsError).message).toContain(sentence)
    expect(cachedPlaceDetails(byId)).toBeUndefined()
  })

  it("fails with a sentence when the server can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"))
    const err = await loadPlaceDetails(getToken, byId).catch((e: unknown) => e)
    expect((err as PlaceDetailsError).message).toContain("Check your connection")
  })

  it("keeps nothing from a lookup that was called off", async () => {
    const controller = new AbortController()
    stubFetch(() => {
      controller.abort()
      return json({ place: palace })
    })
    await loadPlaceDetails(getToken, byId, controller.signal).catch(() => null)
    expect(cachedPlaceDetails(byId)).toBeUndefined()
  })

  it("keeps a full answer the while, and one with few photos (maybe cut short) only briefly", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ url: `https://lh3.googleusercontent.com/p/${i}=s1200` }))
    stubFetch(() => json({ place: { ...palace, photos: six } }))
    await loadPlaceDetails(getToken, byId)
    expect(cachedPlaceDetails(byId, Date.now() + 24 * 60_000)?.photos).toHaveLength(6)

    clearPlaceDetailsCache()
    vi.restoreAllMocks()
    stubFetch(() => json({ place: palace }))
    await loadPlaceDetails(getToken, byId)
    expect(cachedPlaceDetails(byId, Date.now() + 60_000)).toEqual(palace)
    expect(cachedPlaceDetails(byId, Date.now() + 3 * 60_000)).toBeUndefined()
  })

  it("asks Wikipedia again after it failed, not Google", async () => {
    let wikiDown = true
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/places/details")) return json({ place: null })
      if (wikiDown) throw new TypeError("Failed to fetch")
      return wikipedia(url)
    })
    const target = detailsTarget(place())!
    expect(await loadPlaceDetails(getToken, target)).toBeNull()
    // The failure is not an answer: nothing kept.
    expect(cachedPlaceDetails(target)).toBeUndefined()
    wikiDown = false
    expect((await loadPlaceDetails(getToken, target))?.summarySource).toBe("wikipedia")
    expect(urls(spy).filter((url) => url.includes("/api/places/details"))).toHaveLength(1)
    // A real answer is kept.
    expect(cachedPlaceDetails(target)?.summarySource).toBe("wikipedia")
  })

  it("brings Wikipedia in when an idea is filed from Food to Sights", async () => {
    const spy = stubFetch(() => json({ place: null }))
    const asFood = detailsTarget(place({ theme: "food" }))!
    expect(await loadPlaceDetails(getToken, asFood)).toBeNull()
    expect(urls(spy).some((url) => url.includes("wikipedia"))).toBe(false)
    const asSight = detailsTarget(place({ theme: "sights" }))!
    expect(cachedPlaceDetails(asSight)).toBeUndefined()
    expect((await loadPlaceDetails(getToken, asSight))?.summarySource).toBe("wikipedia")
    // Google's "nothing" was kept for the place: only Wikipedia was asked.
    expect(urls(spy).filter((url) => url.includes("/api/places/details"))).toHaveLength(1)
  })

  it("says a slow server is slow, not that the connection is down", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
          }),
      )
      const pending = loadPlaceDetails(getToken, byId).catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(15_000)
      const err = await pending
      expect(err).toBeInstanceOf(PlaceDetailsError)
      expect((err as PlaceDetailsError).message).toContain("taking too long")
    } finally {
      vi.useRealTimers()
    }
  })
})
