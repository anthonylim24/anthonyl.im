import { afterEach, describe, expect, it, vi } from "vitest"
import { cityLabel, searchCities, searchPlaces } from "../geocode"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("searchCities", () => {
  it("maps Open-Meteo rows, including the timezone", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        results: [
          {
            id: 2267057,
            name: "Lisbon",
            latitude: 38.71667,
            longitude: -9.13333,
            country: "Portugal",
            country_code: "PT",
            admin1: "Lisbon District",
            timezone: "Europe/Lisbon",
          },
          { id: 1850147, name: "Tokyo", latitude: 35.6895, longitude: 139.69171, country: "Japan", country_code: "JP", admin1: "Tokyo" },
        ],
      }),
    )

    const cities = await searchCities("São Paulo")
    expect(cities).toEqual([
      {
        id: "2267057",
        name: "Lisbon",
        region: "Lisbon District",
        country: "Portugal",
        countryCode: "PT",
        lat: 38.71667,
        lng: -9.13333,
        timezone: "Europe/Lisbon",
      },
      {
        id: "1850147",
        name: "Tokyo",
        // A region that only repeats the city name is dropped.
        region: undefined,
        country: "Japan",
        countryCode: "JP",
        lat: 35.6895,
        lng: 139.69171,
        timezone: undefined,
      },
    ])
    const url = String(spy.mock.calls[0]![0])
    expect(url).toContain("https://geocoding-api.open-meteo.com/v1/search?")
    expect(url).toContain(`name=${encodeURIComponent("São Paulo")}`)
  })

  it("returns [] when the body has no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}))
    expect(await searchCities("zzzz")).toEqual([])
  })

  it("returns [] on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: true }, 500))
    expect(await searchCities("Lisbon")).toEqual([])
  })

  it("returns [] when the request is aborted", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abort)
    expect(await searchCities("Lisbon")).toEqual([])
  })

  it("passes the abort signal through", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [] }))
    const controller = new AbortController()
    await searchCities("Lisbon", controller.signal)
    expect((spy.mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe("searchPlaces", () => {
  it("maps Photon features: lat/lng order, category and context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        features: [
          {
            geometry: { coordinates: [-9.2159, 38.6916] },
            properties: {
              osm_id: 123,
              osm_type: "W",
              osm_key: "historic",
              osm_value: "castle",
              name: "Belém Tower",
              street: "Avenida Brasília",
              housenumber: "1",
              district: "Belém",
              city: "Lisbon",
              country: "Portugal",
            },
          },
          {
            geometry: { coordinates: [-9.146, 38.707] },
            properties: { osm_id: 9, osm_type: "N", osm_key: "amenity", osm_value: "cafe", name: "Lisbon", city: "Lisbon", country: "Portugal" },
          },
          // Unnamed features and features without coordinates are skipped.
          { geometry: { coordinates: [1, 2] }, properties: { osm_key: "shop" } },
          { properties: { name: "Nowhere" } },
        ],
      }),
    )

    const places = await searchPlaces("belem", null)
    expect(places).toEqual([
      {
        id: "W123",
        name: "Belém Tower",
        context: "Avenida Brasília 1, Belém, Lisbon, Portugal",
        address: "Avenida Brasília 1, Belém, Lisbon, Portugal",
        lat: 38.6916,
        lng: -9.2159,
        category: "palace",
      },
      {
        id: "N9",
        name: "Lisbon",
        // The place's own name is not repeated in its context.
        context: "Portugal",
        address: "Portugal",
        lat: 38.707,
        lng: -9.146,
        category: "cafe",
      },
    ])
  })

  it.each([
    ["amenity", "fast_food", "restaurant"],
    ["amenity", "pub", "bar"],
    ["amenity", "marketplace", "market"],
    ["amenity", "place_of_worship", "shrine"],
    ["amenity", "theatre", "venue"],
    ["amenity", "bank", undefined],
    ["tourism", "museum", "museum"],
    ["tourism", "viewpoint", "viewpoint"],
    ["tourism", "hostel", "hotel"],
    ["tourism", "zoo", "experience"],
    ["tourism", "information", "landmark"],
    ["historic", "ruins", "landmark"],
    ["leisure", "garden", "park"],
    ["leisure", "sports_centre", "experience"],
    ["natural", "beach", "viewpoint"],
    ["natural", "wood", "park"],
    ["shop", "bakery", "shopping"],
    ["railway", "station", "transit"],
    ["place", "suburb", "neighborhood"],
    ["highway", "residential", undefined],
  ])("maps OSM %s=%s to %s", async (osm_key, osm_value, category) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ features: [{ geometry: { coordinates: [1, 2] }, properties: { name: "X", osm_key, osm_value } }] }),
    )
    const [place] = await searchPlaces("x", null)
    expect(place!.category).toBe(category)
  })

  it("leaves address undefined when there is no context, and falls back on ids", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        features: [
          { geometry: { coordinates: [1, 2] }, properties: { name: "Alpha" } },
          { geometry: { coordinates: [3, 4] }, properties: { name: "Beta" } },
        ],
      }),
    )
    const places = await searchPlaces("a", null)
    expect(places.map((p) => [p.id, p.context, p.address])).toEqual([
      ["x0", "", undefined],
      ["x1", "", undefined],
    ])
  })

  it("adds the bias params only when a nearby point is given", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ features: [] }))

    await searchPlaces("pastel de nata", null)
    const plain = String(spy.mock.calls[0]![0])
    expect(plain).toContain("https://photon.komoot.io/api/?")
    expect(plain).toContain(`q=${encodeURIComponent("pastel de nata")}`)
    expect(plain).not.toContain("lat=")
    expect(plain).not.toContain("location_bias_scale")

    await searchPlaces("pastel de nata", { lat: 38.70712, lng: -9.13549 })
    const biased = String(spy.mock.calls[1]![0])
    expect(biased).toContain("&lat=38.71&lon=-9.14&location_bias_scale=0.4")
  })

  it("returns [] on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, 503))
    expect(await searchPlaces("tower", { lat: 1, lng: 2 })).toEqual([])
  })

  it("returns [] when aborted but surfaces other failures", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abort)
    expect(await searchPlaces("tower", null)).toEqual([])

    spy.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(searchPlaces("tower", null)).rejects.toThrow(/Failed to fetch/)
  })
})

describe("cityLabel", () => {
  it("joins the parts that exist", () => {
    expect(cityLabel({ name: "Lisbon", region: "Lisbon District", country: "Portugal" })).toBe("Lisbon, Lisbon District, Portugal")
    expect(cityLabel({ name: "Tokyo", region: undefined, country: "Japan" })).toBe("Tokyo, Japan")
    expect(cityLabel({ name: "Atlantis" })).toBe("Atlantis")
  })
})
