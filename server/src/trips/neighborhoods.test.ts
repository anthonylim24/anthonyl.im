import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import {
  areaId,
  areaStops,
  createNeighborhoods,
  MAX_AREAS,
  MAX_SUMMARY_CHARS,
  NeighborhoodsError,
  readModelAreas,
  stopsHash,
  type AreaModel,
  type AreaPrompt,
} from "./neighborhoods"
import type { ItineraryItem, Trip, TripDay } from "./types"

const place = (id: string, name: string, lat: number, lng: number, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: name,
  status: "none",
  createdBy: "user",
  location: { name, lat, lng, source: "user" },
  ...extra,
})

const day = (id: string, items: ItineraryItem[], extra: Partial<TripDay> = {}): TripDay => ({ id, date: "2026-12-01", items, ...extra })

// Seongsu, Hannam and one stop in Busan.
const SEONGSU = [place("cafe", "Cafe Onion", 37.5447, 127.0581), place("forest", "Seoul Forest", 37.5444, 127.0374), place("haus", "Haus Nowhere", 37.5451, 127.0559)]
const HANNAM = [place("leeum", "Leeum Museum", 37.5384, 126.9993), place("recto", "Recto", 37.5352, 127.0006)]
const BUSAN = place("beach", "Haeundae Beach", 35.1587, 129.1604)

function makeTrip(days: TripDay[]): Trip {
  return {
    id: "trip-1",
    slug: "seoul",
    name: "Seoul",
    destinations: ["Seoul"],
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    timezone: "Asia/Seoul",
    status: "planning",
    ownerId: "user-1",
    collaborators: [],
    days,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  } as unknown as Trip
}

const TRIP = makeTrip([day("day-1", [...SEONGSU, { id: "h", kind: "section", title: "Evening", status: "none", createdBy: "user" } as ItineraryItem]), day("day-2", [...HANNAM, BUSAN])])
const STOPS = areaStops(TRIP)
const keyOf = (id: string) => STOPS.find((stop) => stop.id === id)!.key

const answer = (areas: unknown[]) => JSON.stringify({ areas })

let warn: ReturnType<typeof spyOn>
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe("areaStops", () => {
  test("lists located stops in trip order, with day numbers and opaque keys", () => {
    const trip = makeTrip([
      day("day-1", [place("a", "A", 1, 1), { id: "s", kind: "section", title: "Lunch", status: "none", createdBy: "user" } as ItineraryItem, place("skip", "Skipped", 2, 2, { status: "skipped" })]),
      day("day-2", [{ id: "n", kind: "note", title: "No place", status: "none", createdBy: "user" } as ItineraryItem, place("b", "B", 3, 3)], { city: "Busan" }),
    ])
    expect(areaStops(trip).map(({ id, key, day: d, city }) => ({ id, key, day: d, city }))).toEqual([
      { id: "a", key: "s1", day: 1, city: undefined },
      { id: "b", key: "s2", day: 2, city: "Busan" },
    ])
  })
})

describe("stopsHash", () => {
  test("ignores order, days and names; changes with a stop or a point", () => {
    const base = stopsHash(areaStops(TRIP))
    const reordered = makeTrip([day("day-1", [...HANNAM].reverse()), day("day-2", [BUSAN, ...SEONGSU.map((s) => ({ ...s, title: `${s.title}!` }))])])
    expect(stopsHash(areaStops(reordered))).toBe(base)
    const moved = makeTrip([day("day-1", [...SEONGSU.slice(1), place("cafe", "Cafe Onion", 37.55, 127.0581)]), day("day-2", [...HANNAM, BUSAN])])
    expect(stopsHash(areaStops(moved))).not.toBe(base)
    const added = makeTrip([day("day-1", [...SEONGSU, place("new", "New", 37.5, 127)]), day("day-2", [...HANNAM, BUSAN])])
    expect(stopsHash(areaStops(added))).not.toBe(base)
  })
})

describe("readModelAreas", () => {
  test("keeps the trip's own stop ids and drops keys it never sent", () => {
    const areas = readModelAreas(answer([{ name: "Seongsu-dong", localName: "성수동", city: "Seoul", summary: "Old factories turned into cafés.", stops: [keyOf("cafe"), "s99", 7, keyOf("haus")] }]), STOPS)
    expect(areas).toEqual([
      { id: areaId("Seongsu-dong", "Seoul"), name: "Seongsu-dong", localName: "성수동", city: "Seoul", summary: "Old factories turned into cafés.", stopIds: ["cafe", "haus"] },
    ])
  })

  test("gives a stop to the first area that names it, once", () => {
    const areas = readModelAreas(
      answer([
        { name: "Seongsu-dong", city: "Seoul", summary: "", stops: [keyOf("cafe"), keyOf("cafe"), keyOf("forest")] },
        { name: "Seoul Forest", city: "Seoul", summary: "", stops: [keyOf("forest")] },
      ]),
      STOPS,
    )
    expect(areas.map((a) => [a.name, a.stopIds])).toEqual([["Seongsu-dong", ["cafe", "forest"]]])
  })

  test("joins two areas with the same name in the same city", () => {
    const areas = readModelAreas(
      answer([
        { name: "Seongsu-dong", city: "Seoul", summary: "First.", stops: [keyOf("haus")] },
        { name: "seongsu dong", city: "SEOUL", summary: "Second.", stops: [keyOf("cafe")] },
      ]),
      STOPS,
    )
    expect(areas).toHaveLength(1)
    expect(areas[0]).toMatchObject({ summary: "First.", stopIds: ["cafe", "haus"] })
  })

  test("drops a member far from the rest of its area", () => {
    const areas = readModelAreas(answer([{ name: "Seongsu-dong", city: "Seoul", summary: "", stops: [...SEONGSU.map((s) => keyOf(s.id)), keyOf("beach")] }]), STOPS)
    expect(areas[0]!.stopIds).toEqual(["cafe", "forest", "haus"])
  })

  test("drops areas left with no stops, and a local name that only repeats the name", () => {
    const areas = readModelAreas(
      answer([
        { name: "Nowhere", city: "Seoul", summary: "", stops: ["s404"] },
        { name: "Hannam-dong", localName: "Hannam-dong", city: "Seoul", summary: "", stops: [keyOf("leeum")] },
        { name: "  ", city: "Seoul", summary: "", stops: [keyOf("recto")] },
        { city: "Seoul", stops: [keyOf("recto")] },
      ]),
      STOPS,
    )
    expect(areas).toEqual([{ id: areaId("Hannam-dong", "Seoul"), name: "Hannam-dong", city: "Seoul", summary: "", stopIds: ["leeum"] }])
  })

  test("orders areas by the trip's first visit, and keeps the biggest when there are too many", () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`p${i}`, `P${i}`, 37 + i * 0.5, 127))
    const stops = areaStops(makeTrip([day("day-1", many)]))
    const raw = answer(stops.map((stop, i) => ({ name: `Area ${i}`, city: "Seoul", summary: "", stops: [stop.key] })).reverse())
    const areas = readModelAreas(raw, stops)
    expect(areas).toHaveLength(MAX_AREAS)
    expect(areas.map((a) => a.name)).toEqual(Array.from({ length: MAX_AREAS }, (_, i) => `Area ${i}`))
    const bigger = readModelAreas(
      answer([...stops.slice(0, 13).map((stop, i) => ({ name: `Small ${i}`, city: "Seoul", summary: "", stops: [stop.key] })), { name: "Big", city: "Seoul", summary: "", stops: [stops[13]!.key, stops[14]!.key] }]),
      stops,
    )
    expect(bigger.map((a) => a.name)).toContain("Big")
    expect(bigger).toHaveLength(MAX_AREAS)
  })

  test("cleans the summary: no markdown, no surrounding quotes, clipped", () => {
    const areas = readModelAreas(answer([{ name: "Hannam", city: "Seoul", summary: `"**Quiet** hillside\n lanes ${"x".repeat(400)}"`, stops: [keyOf("leeum")] }]), STOPS)
    expect(areas[0]!.summary.startsWith("Quiet hillside lanes")).toBe(true)
    expect(Array.from(areas[0]!.summary).length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS)
  })

  test("keeps one sentence about the place: a sentence about the trip goes, and the spelling is the tab's", () => {
    const areas = readModelAreas(
      answer([
        { name: "Seongsu-dong", city: "Seoul", summary: "Former factory neighbourhood on the north bank of the Han. The trip visits Cafe Onion and Seoul Forest.", stops: [keyOf("cafe")] },
        { name: "Hannam", city: "Seoul", summary: "Neighbourhood of hillside lanes below Namsan.", stops: [keyOf("leeum")] },
      ]),
      STOPS,
    )
    expect(areas.map((a) => a.summary)).toEqual(["Former factory neighborhood on the north bank of the Han.", "Neighborhood of hillside lanes below Namsan."])
  })

  test("throws a message with none of the model's text when the answer is not the shape asked for", () => {
    expect(() => readModelAreas("I think Seongsu is lovely", STOPS)).toThrow(NeighborhoodsError)
    expect(() => readModelAreas(JSON.stringify({ hoods: [] }), STOPS)).toThrow("model output had no areas")
    try {
      readModelAreas("SECRET-MODEL-TEXT {", STOPS)
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("SECRET")
    }
  })
})

const GROUPED = answer([
  { name: "Seongsu-dong", localName: "성수동", city: "Seoul", summary: "Workshops and cafés.", stops: SEONGSU.map((s) => keyOf(s.id)) },
  { name: "Hannam & Itaewon", localName: "한남동 & 이태원동", city: "Seoul", summary: "Hillside galleries.", stops: HANNAM.map((s) => keyOf(s.id)) },
])

function counting(raw: string | (() => Promise<string>)): AreaModel & { calls: AreaPrompt[] } {
  const calls: AreaPrompt[] = []
  const model = (async (prompt: AreaPrompt) => {
    calls.push(prompt)
    return typeof raw === "string" ? raw : raw()
  }) as AreaModel & { calls: AreaPrompt[] }
  model.calls = calls
  return model
}

/** TRIP with `change` applied to its items. */
const edited = (change: (items: ItineraryItem[], dayIndex: number) => ItineraryItem[], trip: Trip = TRIP) =>
  makeTrip(trip.days.map((d, i) => ({ ...d, items: change(d.items, i) })))

describe("createNeighborhoods", () => {
  test("asks the model once for an unchanged trip, and again when a stop moves", async () => {
    const model = counting(GROUPED)
    const service = createNeighborhoods({ models: [model] })
    const first = await service.list(TRIP)
    expect("areas" in first && first.areas.map((a) => [a.name, a.stopIds, a.photos])).toEqual([
      ["Seongsu-dong", ["cafe", "forest", "haus"], []],
      ["Hannam & Itaewon", ["leeum", "recto"], []],
    ])
    const renamed = makeTrip(TRIP.days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, title: `${i.title} (renamed)` })) })))
    await service.list(renamed)
    expect(model.calls).toHaveLength(1)
    const moved = makeTrip(TRIP.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === "recto" ? place("recto", "Recto", 37.53, 127.001) : i)) })))
    await service.list(moved)
    expect(model.calls).toHaveLength(2)
  })

  test("answers no areas, without asking, when no stop has a point", async () => {
    const model = counting(GROUPED)
    const service = createNeighborhoods({ models: [model] })
    expect(await service.list(makeTrip([day("day-1", [{ id: "n", kind: "note", title: "Pack", status: "none", createdBy: "user" } as ItineraryItem])]))).toEqual({ areas: [] })
    expect(model.calls).toHaveLength(0)
  })

  test("says pending while the model works, then answers from that same call", async () => {
    let release: (raw: string) => void = () => {}
    const model = counting(() => new Promise<string>((resolve) => (release = resolve)))
    const service = createNeighborhoods({ models: [model] })
    expect(await service.list(TRIP, { waitMs: 5 })).toEqual({ pending: true })
    expect(await service.list(TRIP, { waitMs: 5 })).toEqual({ pending: true })
    release(GROUPED)
    await Bun.sleep(1)
    const ready = await service.list(TRIP, { waitMs: 5 })
    expect("areas" in ready && ready.areas).toHaveLength(2)
    expect(model.calls).toHaveLength(1)
  })

  test("reports a failure that came while nobody waited once, then asks again", async () => {
    let fail: (err: Error) => void = () => {}
    let attempt = 0
    const model = counting(() => {
      attempt += 1
      return attempt === 1 ? new Promise<string>((_, reject) => (fail = reject)) : Promise.resolve(GROUPED)
    })
    const service = createNeighborhoods({ models: [model] })
    expect(await service.list(TRIP, { waitMs: 5 })).toEqual({ pending: true })
    fail(new NeighborhoodsError("gemini 500"))
    await Bun.sleep(1)
    await expect(service.list(TRIP, { waitMs: 5 })).rejects.toThrow(NeighborhoodsError)
    const again = await service.list(TRIP, { waitMs: 50 })
    expect("areas" in again && again.areas).toHaveLength(2)
    expect(model.calls).toHaveLength(2)
  })

  test("tries the next model when the first fails, and never caches a failure", async () => {
    const broken = counting(() => Promise.reject(new Error("boom")))
    const backup = counting(GROUPED)
    const service = createNeighborhoods({ models: [broken, backup] })
    const answered = await service.list(TRIP)
    expect("areas" in answered && answered.areas).toHaveLength(2)
    const nothing = counting("{}")
    const failing = createNeighborhoods({ models: [nothing] })
    await expect(failing.list(TRIP)).rejects.toThrow(NeighborhoodsError)
    await expect(failing.list(TRIP)).rejects.toThrow(NeighborhoodsError)
    expect(nothing.calls).toHaveLength(2)
  })

  test("logs none of the trip's text when a model fails", async () => {
    const trip = makeTrip([day("day-1", [place("x", "PRIVATE-PLACE", 37.5, 127, { location: { name: "PRIVATE-PLACE", address: "PRIVATE-ADDRESS", lat: 37.5, lng: 127, source: "user" } })])])
    const service = createNeighborhoods({ models: [counting("PRIVATE-PLACE is in {")] })
    await expect(service.list(trip)).rejects.toThrow()
    const logged = warn.mock.calls.flat().map(String).join("\n")
    expect(logged).not.toContain("PRIVATE")
  })

  test("sends stops as keys inside the data block, without booking codes, emails or phone numbers", async () => {
    const hotel = place("x", "Hotel, guest a.lee@example.com", 37.5, 127, { location: { name: "", address: "Booking K9X2Q7, call +82 10 9876 5432", lat: 37.5, lng: 127, source: "user" } })
    const trip = { ...makeTrip([day("day-1", [hotel], { neighborhoods: ["Seongsu, call +82 10 1234 5678"] })]), name: "Seoul, Booking ZX81QP" }
    const model = counting(answer([]))
    await createNeighborhoods({ models: [model], nonce: () => "n0nce" }).list(trip).catch(() => undefined)
    const prompt = model.calls[0]!
    expect(prompt.stopKeys).toEqual(["s1"])
    expect(prompt.user).toContain("===== TRIP DATA n0nce BEGINS =====")
    expect(prompt.user).not.toContain('"x"')
    for (const secret of ["K9X2Q7", "9876 5432", "a.lee@example.com", "1234 5678", "ZX81QP"]) expect(prompt.user).not.toContain(secret)
  })

  test("adds each area's photo, saying when it is of a stop, none when the lookup fails, and the local name's language", async () => {
    const asked: Array<{ name: string; localName?: string; city: string; reachM: number; stops: readonly { name: string; category?: string }[] }> = []
    const photo = { url: "https://lh3.googleusercontent.com/p/one", author: { name: "Jin" } }
    const trip = edited((items) => items.map((i) => (i.id === "forest" ? { ...i, location: { ...i.location!, category: "park" } } : i)))
    const service = createNeighborhoods({
      models: [counting(GROUPED)],
      photos: async (query) => {
        asked.push(query)
        if (query.name.startsWith("Hannam")) throw new Error("places 500")
        return { photos: [photo], of: "Seoul Forest" }
      },
    })
    const answered = await service.list(trip)
    expect("areas" in answered && answered.areas.map((a) => [a.photos, a.photoOf, a.localLang])).toEqual([
      [[photo], "Seoul Forest", "ko"],
      [[], undefined, "ko"],
    ])
    expect(asked[0]).toMatchObject({ name: "Seongsu-dong", localName: "성수동", city: "Seoul" })
    expect(asked[0]!.stops.map((stop) => [stop.name, stop.category])).toEqual([["Cafe Onion", undefined], ["Seoul Forest", "park"], ["Haus Nowhere", undefined]])
    expect(asked[0]!.reachM).toBeGreaterThan(500)
    expect(asked[0]!.reachM).toBeLessThan(2_000)
  })

  test("looks an area's outline up by its local name, then its English one, with its stops' points", async () => {
    const queries: unknown[] = []
    const service = createNeighborhoods({
      models: [counting(GROUPED)],
      outlines: async (query) => {
        queries.push(query)
        return { type: "Polygon", coordinates: [[[127, 37.5], [127.1, 37.5], [127.1, 37.6], [127, 37.5]]] }
      },
    })
    expect(await service.outline(TRIP, areaId("Seongsu-dong", "Seoul"))).toBeNull()
    await service.list(TRIP)
    expect(await service.outline(TRIP, "a-unknown000")).toBeNull()
    expect(await service.outline(TRIP, areaId("Hannam & Itaewon", "Seoul"))).toMatchObject({ type: "Polygon" })
    expect(queries).toEqual([
      { names: ["한남동 & 이태원동", "Hannam & Itaewon"], city: "Seoul", stops: [expect.objectContaining({ id: "leeum", lat: 37.5384 }), expect.objectContaining({ id: "recto" })] },
    ])
  })
})
