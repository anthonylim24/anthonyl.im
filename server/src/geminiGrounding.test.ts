import { describe, expect, test } from "bun:test"
import {
  asConciergePlace,
  createAddPlacesFenceFilter,
  dropPlacesAlreadyOnTrip,
  enrichPlacesWithGeocode,
  mergeConciergePlaces,
  parseAddPlacesTrailer,
  placeCanBeAdded,
  placesFromMapsChunks,
  safeHttpUrl,
  sourcesFromGrounding,
} from "./geminiGrounding"

describe("parseAddPlacesTrailer", () => {
  test("reads a fenced JSON array", () => {
    const places = parseAddPlacesTrailer(
      `:::add-places\n[{"name":"Ichiran","address":"Shibuya","lat":35.6,"lng":139.7,"category":"restaurant"}]\n:::`,
    )
    expect(places).toEqual([
      { name: "Ichiran", address: "Shibuya", lat: 35.6, lng: 139.7, category: "restaurant" },
    ])
  })

  test("returns empty for junk", () => {
    expect(parseAddPlacesTrailer("")).toEqual([])
    expect(parseAddPlacesTrailer(":::add-places\nnot-json\n:::")).toEqual([])
  })
})

describe("asConciergePlace", () => {
  test("drops javascript: maps urls and out-of-range coords", () => {
    expect(asConciergePlace({ name: "X", mapsUrl: "javascript:alert(1)", lat: 200 })).toEqual({ name: "X" })
    expect(safeHttpUrl("https://maps.google.com/?cid=1")).toContain("maps.google.com")
  })
})

describe("createAddPlacesFenceFilter", () => {
  test("emits visible text and holds the trailer across chunks", () => {
    const fence = createAddPlacesFenceFilter()
    expect(fence.push("Try **Ichiran**.")).toBe("Try **Ichiran**.")
    expect(fence.push("\n:::add-pla")).toBe("")
    expect(fence.push("ces\n[{\"name\":\"Ichiran\"}]\n:::")).toBe("")
    const end = fence.end()
    expect(end.visibleTail).toBe("")
    expect(parseAddPlacesTrailer(end.hidden)[0]?.name).toBe("Ichiran")
  })

  test("passes through a ::: that is not the add-places fence", () => {
    const fence = createAddPlacesFenceFilter()
    expect(fence.push("see ::: docs")).toBe("see ::: docs")
    expect(fence.end()).toEqual({ visibleTail: "", hidden: "" })
  })
})

describe("merge + filter places", () => {
  test("fills trailer fields over Maps chunks and drops itinerary dupes", () => {
    const merged = mergeConciergePlaces(
      [{ name: "Ichiran", address: "Shibuya", lat: 35.6, lng: 139.7 }],
      [
        {
          name: "Ichiran",
          mapsUrl: "https://maps.google.com/?cid=1",
          placeId: "ChIJ12345678",
        },
      ],
    )
    expect(merged[0]).toMatchObject({
      name: "Ichiran",
      address: "Shibuya",
      lat: 35.6,
      mapsUrl: "https://maps.google.com/?cid=1",
      placeId: "ChIJ12345678",
    })
    expect(dropPlacesAlreadyOnTrip(merged, ["ichiran", "Sushi Saito"])).toEqual([])
  })

  test("builds places from Maps grounding chunks", () => {
    const places = placesFromMapsChunks({
      chunks: [
        { kind: "maps", title: "Senso-ji", uri: "https://maps.google.com/?cid=9", placeId: "ChIJabcdefgh" },
        { kind: "web", title: "Blog", uri: "https://example.com" },
      ],
      webSearchQueries: ["sensoji"],
    })
    expect(places).toEqual([
      { name: "Senso-ji", mapsUrl: "https://maps.google.com/?cid=9", placeId: "ChIJabcdefgh" },
    ])
  })
})

describe("sourcesFromGrounding", () => {
  test("dedupes by uri and caps the list", () => {
    const sources = sourcesFromGrounding({
      chunks: [
        { kind: "maps", title: "A", uri: "https://maps.google.com/?cid=1" },
        { kind: "maps", title: "A again", uri: "https://maps.google.com/?cid=1" },
        { kind: "web", title: "Guide", uri: "https://example.com/guide" },
      ],
      webSearchQueries: [],
    })
    expect(sources).toEqual([
      { kind: "maps", title: "A", uri: "https://maps.google.com/?cid=1" },
      { kind: "web", title: "Guide", uri: "https://example.com/guide" },
    ])
  })
})

describe("enrichPlacesWithGeocode", () => {
  test("fills missing coords and leaves complete places alone", async () => {
    const geocode = async (query: string) =>
      query.includes("Missing") ? { lat: 1, lng: 2, address: "Found St", placeId: "ChIJxxxxxxxx" } : null
    const out = await enrichPlacesWithGeocode(
      [
        { name: "Has coords", lat: 10, lng: 20 },
        { name: "Missing" },
      ],
      geocode,
    )
    expect(out[0]).toEqual({ name: "Has coords", lat: 10, lng: 20 })
    expect(out[1]).toEqual({ name: "Missing", lat: 1, lng: 2, address: "Found St", placeId: "ChIJxxxxxxxx" })
    expect(placeCanBeAdded(out[1]!)).toBe(true)
  })
})
