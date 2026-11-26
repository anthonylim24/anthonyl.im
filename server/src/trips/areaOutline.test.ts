import { describe, expect, test } from "bun:test"
import { acceptablePart, createNominatimOutlines, inPolygons, joinParts, MAX_OUTLINE_SEARCHES, NOMINATIM_GAP_MS, type NominatimResult } from "./areaOutline"

/** A square ring around a point, `d` degrees each way. */
const square = (lat: number, lng: number, d: number) => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
]

// Cheongdam-dong's stops, and the two Samseong-dongs (Gangnam's, and Gwanak-gu's, which Nominatim answers first; measured).
const CHEONGDAM_STOPS = [
  { lat: 37.5245, lng: 127.0475 },
  { lat: 37.5262, lng: 127.0512 },
  { lat: 37.5221, lng: 127.0433 },
]
const cheongdam: NominatimResult = { name: "Cheongdam-dong", category: "boundary", type: "administrative", addresstype: "suburb", geojson: { type: "Polygon", coordinates: square(37.525, 127.048, 0.01) } }
const wrongSamseong: NominatimResult = { name: "Samseong-dong", category: "boundary", type: "administrative", addresstype: "suburb", geojson: { type: "Polygon", coordinates: square(37.462, 126.931, 0.01) } }

describe("inPolygons", () => {
  test("counts a point in the outer ring and out of the holes", () => {
    const withHole = [[...square(0, 0, 1), ...square(0, 0, 0.2)]]
    expect(inPolygons({ lat: 0.5, lng: 0.5 }, withHole)).toBe(true)
    expect(inPolygons({ lat: 0, lng: 0 }, withHole)).toBe(false)
    expect(inPolygons({ lat: 2, lng: 0 }, withHole)).toBe(false)
  })
})

describe("acceptablePart", () => {
  test("takes the boundary that holds the stops, not the same-named one across town", () => {
    expect(acceptablePart([wrongSamseong, cheongdam], "Seoul", CHEONGDAM_STOPS)).toEqual([square(37.525, 127.048, 0.01)])
    expect(acceptablePart([wrongSamseong], "Seoul", CHEONGDAM_STOPS)).toBeNull()
  })

  test("passes over points, lines, the city itself, things that are not areas, and shapes too big", () => {
    const point: NominatimResult = { name: "Itaewon-dong", addresstype: "quarter", geojson: { type: "Point", coordinates: [127, 37.5] } }
    const road: NominatimResult = { name: "Jong-ro", addresstype: "primary", geojson: { type: "Polygon", coordinates: square(37.525, 127.048, 0.01) } }
    const city: NominatimResult = { name: "Seoul", addresstype: "city", geojson: { type: "Polygon", coordinates: square(37.525, 127.048, 0.3) } }
    const cityAsDistrict: NominatimResult = { ...cheongdam, name: "Seoul" }
    const huge: NominatimResult = { ...cheongdam, geojson: { type: "Polygon", coordinates: square(37.525, 127.048, 0.3) } }
    const broken: NominatimResult = { ...cheongdam, geojson: { type: "Polygon", coordinates: [[[127, 37.5], ["x", 1]]] } }
    expect(acceptablePart([point, road, city, cityAsDistrict, huge, broken], "Seoul", CHEONGDAM_STOPS)).toBeNull()
  })
})

describe("joinParts", () => {
  test("needs most of the area's stops inside", () => {
    const outside = { lat: 37.6, lng: 127.2 }
    expect(joinParts([[square(37.525, 127.048, 0.01)]], [...CHEONGDAM_STOPS, outside])).toEqual({ type: "Polygon", coordinates: square(37.525, 127.048, 0.01) })
    expect(joinParts([[square(37.525, 127.048, 0.01)]], [CHEONGDAM_STOPS[0]!, outside])).toBeNull()
    expect(joinParts([[square(37.525, 127.048, 0.01)]], [CHEONGDAM_STOPS[0]!, outside, outside])).toBeNull()
    expect(joinParts([], CHEONGDAM_STOPS)).toBeNull()
  })

  test("draws two neighborhoods as one multipolygon", () => {
    const joined = joinParts([[square(37.525, 127.048, 0.01)], [square(37.6, 127.2, 0.01)]], [...CHEONGDAM_STOPS, { lat: 37.6, lng: 127.2 }])
    expect(joined?.type).toBe("MultiPolygon")
  })
})

function fakeNominatim(byQuery: Record<string, NominatimResult[] | number>) {
  const calls: Array<{ q: string; at: number; agent: string | null }> = []
  let clock = 1_000_000
  const now = () => clock
  const sleep = async (ms: number) => {
    clock += ms
  }
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const q = url.searchParams.get("q") ?? ""
    calls.push({ q, at: clock, agent: new Headers(init?.headers).get("User-Agent") })
    const answer = byQuery[q]
    if (typeof answer === "number") return new Response("busy", { status: answer })
    return Response.json(answer ?? [])
  }) as typeof fetch
  return { fetchImpl, calls, now, sleep }
}

describe("createNominatimOutlines", () => {
  test("tries the local name first, spaces requests a second apart, and names the app", async () => {
    const osm = fakeNominatim({ "청담동, Seoul": [], "Cheongdam-dong, Seoul": [cheongdam] })
    const lookup = createNominatimOutlines(osm)
    const outline = await lookup({ names: ["청담동", "Cheongdam-dong"], city: "Seoul", stops: CHEONGDAM_STOPS })
    expect(outline).toEqual({ type: "Polygon", coordinates: square(37.525, 127.048, 0.01) })
    expect(osm.calls.map((call) => call.q)).toEqual(["청담동, Seoul", "Cheongdam-dong, Seoul"])
    expect(osm.calls[1]!.at - osm.calls[0]!.at).toBeGreaterThanOrEqual(NOMINATIM_GAP_MS)
    expect(osm.calls.every((call) => call.agent?.includes("anthonyl.im"))).toBe(true)
  })

  test("keeps each area's answer, so asking again sends nothing, and searches again for other stops", async () => {
    const osm = fakeNominatim({ "Cheongdam-dong, Seoul": [cheongdam] })
    const lookup = createNominatimOutlines(osm)
    const query = { names: ["Cheongdam-dong"], city: "Seoul", stops: CHEONGDAM_STOPS }
    await lookup(query)
    await lookup({ ...query, stops: [...CHEONGDAM_STOPS].reverse() })
    expect(osm.calls).toHaveLength(1)
    // The same name with stops across town is another answer: the boundary must hold them.
    expect(await lookup({ ...query, stops: [{ lat: 37.462, lng: 126.931 }] })).toBeNull()
    expect(osm.calls).toHaveLength(2)
  })

  test("keeps only the accepted shapes, forgetting the oldest past its budget of points", async () => {
    const osm = fakeNominatim({ "Cheongdam-dong, Seoul": [cheongdam], "Nowhere, Seoul": [] })
    // One square is five points: room for one shape, and for any number of "no outline" answers.
    const lookup = createNominatimOutlines({ ...osm, maxHeldPoints: 8 })
    const cheongdamQuery = { names: ["Cheongdam-dong"], city: "Seoul", stops: CHEONGDAM_STOPS }
    const elsewhere = { ...cheongdamQuery, stops: CHEONGDAM_STOPS.map((stop) => ({ lat: stop.lat + 0.001, lng: stop.lng })) }
    const nowhere = { names: ["Nowhere"], city: "Seoul", stops: CHEONGDAM_STOPS }
    await lookup(cheongdamQuery)
    await lookup(nowhere)
    await lookup(elsewhere)
    expect(osm.calls).toHaveLength(3)
    await lookup(nowhere)
    await lookup(elsewhere)
    expect(osm.calls).toHaveLength(3)
    await lookup(cheongdamQuery)
    expect(osm.calls).toHaveLength(4)
  })

  test("gives up when its deadline passes while queued, sending nothing", async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => (release = resolve))
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(new URL(String(input)).searchParams.get("q") ?? "")
      await blocked
      return Response.json([cheongdam])
    }) as typeof fetch
    const lookup = createNominatimOutlines({ fetchImpl, gapMs: 0 })
    const first = lookup({ names: ["Cheongdam-dong"], city: "Seoul", stops: CHEONGDAM_STOPS })
    const deadline = new AbortController()
    const second = lookup({ names: ["Apgujeong"], city: "Seoul", stops: CHEONGDAM_STOPS }, deadline.signal)
    deadline.abort(new Error("outline deadline"))
    await expect(second).rejects.toThrow("outline deadline")
    release()
    await first
    await Bun.sleep(1)
    expect(calls).toEqual(["Cheongdam-dong, Seoul"])
  })

  test("answers null when there is no outline, and throws (uncached) when Nominatim fails", async () => {
    const osm = fakeNominatim({ "Itaewon, Seoul": [], "Hannam, Seoul": 503 })
    const lookup = createNominatimOutlines(osm)
    expect(await lookup({ names: ["Itaewon"], city: "Seoul", stops: CHEONGDAM_STOPS })).toBeNull()
    const failing = { names: ["Hannam"], city: "Seoul", stops: CHEONGDAM_STOPS }
    await expect(lookup(failing)).rejects.toThrow("nominatim 503")
    await expect(lookup(failing)).rejects.toThrow("nominatim 503")
    expect(osm.calls.filter((call) => call.q === "Hannam, Seoul")).toHaveLength(2)
  })

  test("makes at most MAX_OUTLINE_SEARCHES searches, the figure the route's rate limit is sized by", async () => {
    const osm = fakeNominatim({})
    const lookup = createNominatimOutlines(osm)
    expect(await lookup({ names: ["한남동 & 이태원동 & 용산동", "Hannam & Itaewon", "Yongsan"], city: "Seoul", stops: CHEONGDAM_STOPS })).toBeNull()
    expect(osm.calls.map((call) => call.q)).toEqual(["한남동, Seoul", "Hannam, Seoul", "이태원동, Seoul", "Itaewon, Seoul"])
    expect(osm.calls).toHaveLength(MAX_OUTLINE_SEARCHES)
  })

  test("joins the outlines of both neighborhoods an area is named for", async () => {
    const hannam: NominatimResult = { ...cheongdam, name: "Hannam-dong", geojson: { type: "Polygon", coordinates: square(37.535, 127.0, 0.008) } }
    const itaewon: NominatimResult = { ...cheongdam, name: "Itaewon-dong", geojson: { type: "Polygon", coordinates: square(37.535, 126.99, 0.004) } }
    const osm = fakeNominatim({ "한남동, Seoul": [hannam], "이태원동, Seoul": [itaewon] })
    const stops = [
      { lat: 37.535, lng: 127.001 },
      { lat: 37.535, lng: 126.99 },
    ]
    const outline = await createNominatimOutlines(osm)({ names: ["한남동 & 이태원동", "Hannam & Itaewon"], city: "Seoul", stops })
    expect(outline?.type).toBe("MultiPolygon")
    expect(osm.calls.map((call) => call.q)).toEqual(["한남동, Seoul", "이태원동, Seoul"])
  })
})
