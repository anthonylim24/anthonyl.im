import { describe, expect, test } from "bun:test"
import { createGoogleAreaPhotos, nameParts, pickAreaPlace, type RawAreaPlace } from "./areaPhotos"

const KEY = "test-maps-key"
const SEONGSU = { name: "Seongsu-dong", localName: "성수동", city: "Seoul", centre: { lat: 37.5447, lng: 127.0559 }, reachM: 900 }

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
  test("splits an area named for two neighbourhoods", () => {
    expect(nameParts("Hannam & Itaewon")).toEqual(["Hannam", "Itaewon"])
    expect(nameParts("압구정·청담")).toEqual(["압구정", "청담"])
    expect(nameParts("Roma Norte")).toEqual(["Roma Norte"])
  })
})

describe("pickAreaPlace", () => {
  test("passes over a park or landmark that shares the area's name", () => {
    const dosan = { centre: { lat: 37.5236, lng: 127.0355 }, reachM: 600, city: "Seoul" }
    expect(pickAreaPlace([hit("Dosan Park", ["park", "tourist_attraction", "point_of_interest"], 37.5245, 127.0355)], dosan)).toBeNull()
    expect(pickAreaPlace([hit("Bukchon Hanok Village", ["landmark", "cultural_landmark"], 37.5826, 126.9836)], dosan)).toBeNull()
  })

  test("takes the first part of a city near the stops, never one far off or the city itself", () => {
    const far = hit("Samseong-dong", ["sublocality_level_2", "sublocality", "political"], 37.4636, 126.9306)
    const city = hit("Seoul", ["locality", "political"], 37.5665, 126.978)
    const cityAsArea = hit("Seoul", ["sublocality"], 37.5447, 127.0559)
    const near = hit("Seongsu-dong 2(i)-ga", ["sublocality_level_2", "sublocality"], 37.5417, 127.0597)
    expect(pickAreaPlace([far, city, cityAsArea, near], SEONGSU)).toBe(near)
    expect(pickAreaPlace([far], SEONGSU)).toBeNull()
  })

  test("allows a district's point a little further out when the area's stops are spread", () => {
    const jongno = hit("Jongno District", ["sublocality_level_1", "sublocality"], 37.5951, 126.9773)
    const centre = { lat: 37.5760, lng: 126.985 }
    expect(pickAreaPlace([jongno], { centre, reachM: 300, city: "Seoul" })).not.toBeNull()
    expect(pickAreaPlace([jongno], { centre: { lat: 37.555, lng: 126.985 }, reachM: 300, city: "Seoul" })).toBeNull()
  })
})

function fakeGoogle(answers: Record<string, RawAreaPlace[]>) {
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
    return Response.json({ photoUri: `https://lh3.googleusercontent.com/places/${photo}=s800` })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe("createGoogleAreaPhotos", () => {
  test("answers up to three credited photos with keyless URLs, the key only in a header", async () => {
    const google = fakeGoogle({ "Seongsu-dong, Seoul": [hit("Seongsu-dong", ["sublocality"], 37.545, 127.056, 5)] })
    const photos = await createGoogleAreaPhotos(KEY, google.fetchImpl)(SEONGSU)
    expect(photos).toEqual([0, 1, 2].map((i) => ({
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
    const query = { name: "Bukchon", localName: "북촌", city: "Seoul", centre: { lat: 37.5826, lng: 126.9836 }, reachM: 400 }
    expect(await lookup(query)).toHaveLength(1)
    expect(google.calls.flatMap((call) => call.query ?? [])).toEqual(["Bukchon, Seoul", "북촌, Seoul"])
    const before = google.calls.length
    await lookup(query)
    expect(google.calls.length).toBe(before)
  })

  test("answers no photos when nothing found is the area", async () => {
    const google = fakeGoogle({ "Dosan, Seoul": [hit("Dosan Park", ["park"], 37.5245, 127.0355, 10)] })
    expect(await createGoogleAreaPhotos(KEY, google.fetchImpl)({ name: "Dosan", city: "Seoul", centre: { lat: 37.5236, lng: 127.0355 }, reachM: 500 })).toEqual([])
    expect(google.calls.some((call) => call.url.includes("/media?"))).toBe(false)
  })
})
