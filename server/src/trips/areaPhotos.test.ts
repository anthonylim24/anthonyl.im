import { describe, expect, test } from "bun:test"
import { createGoogleAreaPhotos, nameParts, pickAreaPlace, standInStop, type PhotoStop, type RawAreaPlace } from "./areaPhotos"

const KEY = "test-maps-key"
const SEONGSU = { name: "Seongsu-dong", localName: "성수동", city: "Seoul", centre: { lat: 37.5447, lng: 127.0559 }, reachM: 900, stops: [] }

const at = (lat: number, lng: number) => ({ latitude: lat, longitude: lng })
const hit = (name: string, types: string[], lat: number, lng: number, photos = 0): RawAreaPlace => ({
  id: `id-${name.replace(/\W/g, "")}`.padEnd(12, "x"),
  displayName: { text: name },
  types,
  location: at(lat, lng),
  photos: Array.from({ length: photos }, (_, i) => ({
    name: `places/id${name.replace(/\W/g, "")}xxxxxx/photos/photo${i}xxxxxxxx`,
    widthPx: 4000,
    heightPx: 3000,
    authorAttributions: [{ displayName: `Author ${i}`, uri: "https://maps.google.com/maps/contrib/1" }],
  })),
})

describe("nameParts", () => {
  test("splits an area named for two neighborhoods", () => {
    expect(nameParts("Hannam & Itaewon")).toEqual(["Hannam", "Itaewon"])
    expect(nameParts("압구정·청담")).toEqual(["압구정", "청담"])
    expect(nameParts("Roma Norte")).toEqual(["Roma Norte"])
  })
})

describe("pickAreaPlace", () => {
  test("passes over a park or landmark that shares the area's name", () => {
    const dosan = { centre: { lat: 37.5236, lng: 127.0355 }, reachM: 600, city: "Seoul", text: "Dosan" }
    expect(pickAreaPlace([hit("Dosan Park", ["park", "tourist_attraction", "point_of_interest"], 37.5245, 127.0355)], dosan)).toBeNull()
    expect(pickAreaPlace([hit("Bukchon Hanok Village", ["landmark", "cultural_landmark"], 37.5826, 126.9836)], dosan)).toBeNull()
  })

  test("takes the first part of a city near the stops, never one far off or the city itself", () => {
    const far = hit("Samseong-dong", ["sublocality_level_2", "sublocality", "political"], 37.4636, 126.9306)
    const city = hit("Seoul", ["locality", "political"], 37.5665, 126.978)
    const cityAsArea = hit("Seoul", ["sublocality"], 37.5447, 127.0559)
    const near = hit("Seongsu-dong 2(i)-ga", ["sublocality_level_2", "sublocality"], 37.5417, 127.0597)
    const seongsu = { ...SEONGSU, text: "Seongsu-dong" }
    expect(pickAreaPlace([far, city, cityAsArea, near], seongsu)).toBe(near)
    expect(pickAreaPlace([far], seongsu)).toBeNull()
  })

  test("takes a ward Google files only as a locality when it is the name searched, never the city by another name", () => {
    const shibuya = { centre: { lat: 35.6595, lng: 139.7005 }, reachM: 800, city: "Tokyo" }
    const ward = hit("Shibuya", ["locality", "political"], 35.6618, 139.7041)
    expect(pickAreaPlace([ward], { ...shibuya, text: "Shibuya" })).toBe(ward)
    expect(pickAreaPlace([hit("渋谷区", ["locality", "political"], 35.6618, 139.7041)], { ...shibuya, text: "渋谷" })).not.toBeNull()
    // A ward next door, found for another name, is not this area.
    expect(pickAreaPlace([hit("Minato City", ["locality", "political"], 35.6581, 139.7017)], { ...shibuya, text: "Shibuya" })).toBeNull()
    const kyoto = { centre: { lat: 35.0037, lng: 135.7788 }, reachM: 800, city: "Kyoto" }
    expect(pickAreaPlace([hit("Kyoto City", ["locality", "political"], 35.0116, 135.7681)], { ...kyoto, text: "Kyoto" })).toBeNull()
    expect(pickAreaPlace([hit("Kyoto", ["locality", "political"], 35.0116, 135.7681)], { ...kyoto, text: "Kyoto" })).toBeNull()
  })

  test("allows a district's point a little further out when the area's stops are spread", () => {
    const jongno = hit("Jongno District", ["sublocality_level_1", "sublocality"], 37.5951, 126.9773)
    const centre = { lat: 37.5760, lng: 126.985 }
    expect(pickAreaPlace([jongno], { centre, reachM: 300, city: "Seoul", text: "Jongno" })).not.toBeNull()
    expect(pickAreaPlace([jongno], { centre: { lat: 37.555, lng: 126.985 }, reachM: 300, city: "Seoul", text: "Jongno" })).toBeNull()
  })
})

describe("standInStop", () => {
  const stop = (name: string, category?: string): PhotoStop => ({ name, category, lat: 35, lng: 135 })

  test("picks the stop most likely to stand for its area, the first visited among equals", () => {
    expect(standInStop([stop("Cafe", "cafe"), stop("Fushimi Inari", "shrine"), stop("Kiyomizu", "shrine")])?.name).toBe("Fushimi Inari")
    expect(standInStop([stop("Unknown"), stop("Ramen", "restaurant")])?.name).toBe("Ramen")
  })

  test("never a hotel or a station", () => {
    expect(standInStop([stop("Park Hyatt", "hotel"), stop("Kyoto Station", "transit")])).toBeNull()
    expect(standInStop([stop("Park Hyatt", "hotel"), stop("Bar", "bar")])?.name).toBe("Bar")
  })
})

function fakeGoogle(answers: Record<string, RawAreaPlace[]>, details: Record<string, RawAreaPlace> = {}) {
  const calls: Array<{ url: string; key: string | null; query?: string; redirect?: string }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const call: (typeof calls)[number] = { url, key: headers.get("X-Goog-Api-Key"), redirect: init?.redirect }
    calls.push(call)
    if (url.endsWith(":searchText")) {
      const query = (JSON.parse(String(init?.body)) as { textQuery: string }).textQuery
      call.query = query
      return Response.json({ places: answers[query] ?? [] })
    }
    const photo = /photos\/(photo\d)/.exec(url)?.[1]
    if (photo) return Response.json({ photoUri: `https://lh3.googleusercontent.com/places/${photo}=s800` })
    const id = /\/places\/([^/?]+)$/.exec(url)?.[1]
    return details[id ?? ""] ? Response.json(details[id!]) : new Response("{}", { status: 404 })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe("createGoogleAreaPhotos", () => {
  test("answers one credited photo with a keyless URL, the key only in a header", async () => {
    const google = fakeGoogle({ "Seongsu-dong, Seoul": [hit("Seongsu-dong", ["sublocality"], 37.545, 127.056, 5)] })
    const answer = await createGoogleAreaPhotos(KEY, google.fetchImpl)(SEONGSU)
    expect(answer.of).toBeUndefined()
    expect(answer.photos).toEqual([0].map((i) => ({
      url: `https://lh3.googleusercontent.com/places/photo${i}=s800`,
      width: 800,
      height: 600,
      author: { name: `Author ${i}`, uri: "https://maps.google.com/maps/contrib/1" },
    })))
    expect(google.calls.every((call) => call.key === KEY && !call.url.includes(KEY) && call.redirect === "error")).toBe(true)
    expect(google.calls.filter((call) => call.url.includes("/media?")).every((call) => call.url.includes("skipHttpRedirect=true"))).toBe(true)
  })

  test("tries the local name when the English one finds only a landmark, and caches the answer", async () => {
    const google = fakeGoogle({
      "Bukchon, Seoul": [hit("Bukchon Hanok Village", ["landmark"], 37.5826, 126.9836, 10)],
      "북촌, Seoul": [hit("Gahoe-dong", ["sublocality_level_2", "sublocality"], 37.5822, 126.985, 1)],
    })
    const lookup = createGoogleAreaPhotos(KEY, google.fetchImpl)
    const query = { name: "Bukchon", localName: "북촌", city: "Seoul", centre: { lat: 37.5826, lng: 126.9836 }, reachM: 400, stops: [] }
    expect((await lookup(query)).photos).toHaveLength(1)
    expect(google.calls.flatMap((call) => call.query ?? [])).toEqual(["Bukchon, Seoul", "북촌, Seoul"])
    const before = google.calls.length
    await lookup(query)
    expect(google.calls.length).toBe(before)
  })

  test("refreshes lapsed photo links without searching for the area again", async () => {
    let clock = 0
    const google = fakeGoogle({ "Seongsu-dong, Seoul": [hit("Seongsu-dong", ["sublocality"], 37.545, 127.056, 5)] })
    const lookup = createGoogleAreaPhotos(KEY, google.fetchImpl, { ttlMs: 1_000, placeTtlMs: 60_000, now: () => clock })
    await lookup(SEONGSU)
    clock = 2_000
    expect((await lookup(SEONGSU)).photos).toHaveLength(1)
    expect(google.calls.filter((call) => call.query).length).toBe(1)
    expect(google.calls.filter((call) => call.url.includes("/media?")).length).toBe(2)
  })

  test("answers no photos when nothing found is the area and no stop can stand for it", async () => {
    const google = fakeGoogle({ "Dosan, Seoul": [hit("Dosan Park", ["park"], 37.5245, 127.0355, 10)] })
    const hotel = { name: "Andaz", category: "hotel", lat: 37.5251, lng: 127.0281 }
    const answer = await createGoogleAreaPhotos(KEY, google.fetchImpl)({ name: "Dosan", city: "Seoul", centre: { lat: 37.5236, lng: 127.0355 }, reachM: 500, stops: [hotel] })
    expect(answer).toEqual({ photos: [] })
    expect(google.calls.some((call) => call.url.includes("/media?"))).toBe(false)
  })

  test("falls back to the photo of the area's best-known stop, found by its place id, and names it", async () => {
    const fushimi = { name: "Fushimi Inari Taisha", category: "shrine", placeId: "ChIJIW0uPRUPAWAR6eI6dRzKGns", lat: 34.9671, lng: 135.7727 }
    const google = fakeGoogle({}, { [fushimi.placeId]: hit("Fushimi Inari Taisha", ["shrine"], 34.9671, 135.7727, 3) })
    const query = { name: "Fushimi", city: "Kyoto", centre: fushimi, reachM: 0, stops: [{ name: "Ryokan", category: "hotel", lat: 34.968, lng: 135.772 }, fushimi] }
    const answer = await createGoogleAreaPhotos(KEY, google.fetchImpl)(query)
    expect(answer.of).toBe("Fushimi Inari Taisha")
    expect(answer.photos).toHaveLength(1)
    const byId = google.calls.find((call) => call.url.endsWith(`/places/${fushimi.placeId}`))
    expect(byId).toMatchObject({ key: KEY, redirect: "error" })
    expect(google.calls.every((call) => !call.url.includes(KEY))).toBe(true)
  })

  test("finds a stop with no place id by name near it, and takes no hit that is far off or another place", async () => {
    const cafe = { name: "Blue Bottle Kiyomizu", category: "cafe", lat: 34.9968, lng: 135.7802 }
    const right = fakeGoogle({ "Blue Bottle Kiyomizu": [hit("Blue Bottle Coffee Kyoto Cafe", ["cafe"], 34.9969, 135.7803, 2)] })
    const query = { name: "Higashiyama", city: "Kyoto", centre: cafe, reachM: 0, stops: [cafe] }
    expect(await createGoogleAreaPhotos(KEY, right.fetchImpl)(query)).toMatchObject({ of: "Blue Bottle Kiyomizu" })
    const far = fakeGoogle({ "Blue Bottle Kiyomizu": [hit("Blue Bottle Kiyomizu", ["cafe"], 35.01, 135.76, 2)] })
    expect(await createGoogleAreaPhotos(KEY, far.fetchImpl)(query)).toEqual({ photos: [] })
    // 600 m off, as Google's point for a wide shrine is: only its very name will do.
    const inari = { name: "Fushimi Inari Taisha", category: "shrine", lat: 34.9671, lng: 135.7727 }
    const wide = fakeGoogle({ "Fushimi Inari Taisha": [hit("Fushimi Inari Taisha", ["shinto_shrine"], 34.9677, 135.7792, 2)] })
    expect(await createGoogleAreaPhotos(KEY, wide.fetchImpl)({ ...query, centre: inari, stops: [inari] })).toMatchObject({ of: "Fushimi Inari Taisha" })
    const near = fakeGoogle({ "Blue Bottle Kiyomizu": [hit("Blue Bottle Coffee", ["cafe"], 35.0014, 135.7802, 2)] })
    expect(await createGoogleAreaPhotos(KEY, near.fetchImpl)(query)).toEqual({ photos: [] })
    const other = fakeGoogle({ "Blue Bottle Kiyomizu": [hit("Starbucks Ninenzaka", ["cafe"], 34.9969, 135.7803, 2)] })
    expect(await createGoogleAreaPhotos(KEY, other.fetchImpl)(query)).toEqual({ photos: [] })
  })
})
