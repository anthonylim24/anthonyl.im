import { afterEach, describe, expect, it, vi } from "vitest"
import { cityLabel, isClutter, LOCAL_METERS, localBox, nameKey, nameMatches, rankPlaces, searchCities, searchPlaces, worthAskingGoogle, type PlaceResult } from "../geocode"

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

  it("lists two places that read the same once, the first one kept", async () => {
    const kyo = (id: number, lat: number) => ({ id, name: "Kyo", latitude: lat, longitude: 8.9, country: "Nigeria", country_code: "NG", admin1: "Benue State" })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ results: [{ id: 1, name: "Kyoto", latitude: 35, longitude: 135.7, country: "Japan", country_code: "JP" }, kyo(2, 7.1), kyo(3, 7.4)] }),
    )
    const cities = await searchCities("Kyo")
    expect(cities.map(cityLabel)).toEqual(["Kyoto, Japan", "Kyo, Benue State, Nigeria"])
    expect(cities[1]!.id).toBe("2")
  })

  it("returns [] when the body has no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}))
    expect(await searchCities("zzzz")).toEqual([])
  })

  it("rejects on a non-OK response, so a failed search never reads as no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: true }, 500))
    await expect(searchCities("Lisbon")).rejects.toMatchObject({ _tag: "HttpStatusError", status: 500 })
  })

  it("rejects when the network is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(searchCities("Lisbon")).rejects.toThrow(/Failed to fetch/)
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

  it("searches worldwide without a nearby point, and also inside a box around one", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ features: [] }))

    await searchPlaces("pastel de nata", null)
    expect(spy).toHaveBeenCalledTimes(1)
    const plain = String(spy.mock.calls[0]![0])
    expect(plain).toContain("https://photon.komoot.io/api/?")
    expect(plain).toContain(`q=${encodeURIComponent("pastel de nata")}`)
    expect(plain).not.toContain("lat=")
    expect(plain).not.toContain("bbox=")

    spy.mockClear()
    await searchPlaces("pastel de nata", { lat: 38.70712, lng: -9.13549 })
    const urls = spy.mock.calls.map((call) => String(call[0]))
    expect(urls).toHaveLength(2)
    expect(urls.find((url) => url.includes("bbox="))).toContain(`&bbox=${localBox({ lat: 38.70712, lng: -9.13549 })}`)
    expect(urls.find((url) => !url.includes("bbox="))).toContain("&lat=38.71&lon=-9.14&location_bias_scale=0.1")
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

describe("searchPlaces ranking", () => {
  const feature = (id: number, name: string, key: string, value: string, lng: number, lat: number) => ({
    geometry: { coordinates: [lng, lat] },
    properties: { osm_id: id, osm_type: "N", osm_key: key, osm_value: value, name, city: "Kahuku", country: "United States" },
  })

  it("drops map furniture that shares a venue's name, and repeats of the same place", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        features: [
          feature(1, "Turtle Bay Resort", "highway", "bus_stop", -157.9981, 21.7049),
          feature(2, "Turtle Bay Resort", "amenity", "charging_station", -157.9979, 21.705),
          feature(3, "Turtle Bay Resort", "tourism", "resort", -157.9977, 21.7056),
          feature(4, "Turtle Bay Resort", "building", "hotel", -157.9976, 21.7055),
          feature(5, "Turtle Bay Golf", "leisure", "golf_course", -158.0005, 21.7031),
        ],
      }),
    )
    const places = await searchPlaces("Turtle Bay Resort", { lat: 21.3, lng: -157.85 })
    expect(places.map((p) => [p.id, p.name, p.category])).toEqual([
      ["N3", "Turtle Bay Resort", "hotel"],
      ["N5", "Turtle Bay Golf", "experience"],
    ])
  })

  it("still answers when only map furniture matched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ features: [feature(1, "Kuilima Drive", "highway", "residential", -157.99, 21.7)] }))
    expect((await searchPlaces("Kuilima Drive", null)).map((p) => p.name)).toEqual(["Kuilima Drive"])
  })

  it("knows clutter from venues", () => {
    expect(isClutter("highway", "bus_stop")).toBe(true)
    expect(isClutter("amenity", "charging_station")).toBe(true)
    expect(isClutter("amenity", "restaurant")).toBe(false)
    expect(isClutter("tourism", "hotel")).toBe(false)
    expect(isClutter(undefined, undefined)).toBe(false)
  })
})

describe("searchPlaces with Google", () => {
  const honolulu = { lat: 21.3, lng: -157.86 }
  const gohan: PlaceResult = {
    id: "g:ChIJgohan",
    name: "GOHAN",
    context: "1314 S King St Ste G3, Honolulu",
    address: "1314 S King St Ste G3, Honolulu, HI 96814, USA",
    lat: 21.2978,
    lng: -157.8367,
    category: "restaurant",
    placeId: "ChIJgohan",
  }
  // What OpenStreetMap answers for "Gohan": a Korean station and an Indian village, nothing on O'ahu.
  const osmGohan = {
    features: [
      { geometry: { coordinates: [128.66, 37.42] }, properties: { osm_id: 1, osm_type: "N", osm_key: "railway", osm_value: "station", name: "Gohan", country: "South Korea" } },
      { geometry: { coordinates: [78.1, 22.9] }, properties: { osm_id: 2, osm_type: "R", osm_key: "place", osm_value: "village", name: "Gohan", country: "India" } },
    ],
  }
  const route = (handlers: { places?: () => Response; photon?: (url: string) => Response }) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/places/search")) return handlers.places ? handlers.places() : json({ places: [] })
      if (url.includes("photon.komoot.io")) return handlers.photon ? handlers.photon(url) : json({ features: [] })
      throw new Error(`unexpected fetch ${url}`)
    })

  it("puts the local Google match first, ahead of same-named places abroad", async () => {
    const spy = route({ places: () => json({ places: [gohan] }), photon: (url) => json(url.includes("bbox=") ? { features: [] } : osmGohan) })
    const places = await searchPlaces("Gohan", honolulu, undefined, async () => "token")
    expect(places.map((p) => [p.name, p.context])).toEqual([
      ["GOHAN", "1314 S King St Ste G3, Honolulu"],
      ["Gohan", "South Korea"],
      ["Gohan", "India"],
    ])
    expect(places[0]!.placeId).toBe("ChIJgohan")
    expect(places[0]!.address).toBe("1314 S King St Ste G3, Honolulu, HI 96814, USA")

    const call = spy.mock.calls.find((c) => String(c[0]).includes("/api/places/search"))!
    expect(String(call[0])).toContain("q=Gohan&lat=21.30&lng=-157.86")
    expect(new Headers((call[1] as RequestInit).headers).get("Authorization")).toBe("Bearer token")
  })

  it("keeps the OpenStreetMap results when the server refuses", async () => {
    route({ places: () => json({ error: "place search unavailable" }, 503), photon: () => json(osmGohan) })
    const places = await searchPlaces("Gohan", null, undefined, async () => "token")
    expect(places.map((p) => p.context)).toEqual(["South Korea", "India"])
  })

  it("keeps Google's results when Photon is down", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/places/search")) return json({ places: [gohan] })
      throw new TypeError("Failed to fetch")
    })
    expect((await searchPlaces("Gohan", honolulu, undefined, async () => "token")).map((p) => p.name)).toEqual(["GOHAN"])
  })

  it("fails only when every source failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(searchPlaces("Gohan", honolulu, undefined, async () => "token")).rejects.toThrow(/Failed to fetch/)
  })

  it("skips Google when signed out or for a two-letter query", async () => {
    const spy = route({})
    await searchPlaces("Gohan", honolulu, undefined, async () => null)
    await searchPlaces("Go", honolulu, undefined, async () => "token")
    expect(spy.mock.calls.some((c) => String(c[0]).includes("/api/places/search"))).toBe(false)
  })

  it("ignores malformed server rows", async () => {
    route({ places: () => json({ places: [gohan, { id: "g:x", name: "No point" }, { name: "No id", lat: 1, lng: 2 }, null] }) })
    expect((await searchPlaces("Gohan", null, undefined, async () => "token")).map((p) => p.name)).toEqual(["GOHAN"])
  })
})

describe("rankPlaces", () => {
  const place = (id: string, name: string, lat: number, lng: number): PlaceResult => ({ id, name, context: "", lat, lng })
  const waikiki = { lat: 21.28, lng: -157.83 }

  it("lists local places first, each tier in source order", () => {
    const google = [place("g1", "Duke's Tokyo", 35.68, 139.76), place("g2", "Duke's Waikiki", 21.2766, -157.8278)]
    const osm = [place("o1", "Duke's Dress Shop", 21.5, -158.02), place("o2", "Duke's Barcelona", 41.38, 2.17)]
    expect(rankPlaces([google, osm], waikiki).map((p) => p.id)).toEqual(["g2", "o1", "g1", "o2"])
  })

  it("keeps source order without a point", () => {
    expect(rankPlaces([[place("a", "A", 50, 50)], [place("b", "B", 0, 0)]], null).map((p) => p.id)).toEqual(["a", "b"])
  })

  it("merges one place found twice, keeping the earlier source's copy", () => {
    const google = [place("g1", "Leonard's Bakery", 21.2848, -157.8133)]
    const osm = [place("o1", "Leonard’s Bakery", 21.2849, -157.8134), place("o2", "LEONARDS BAKERY", 21.4, -157.8), place("g1", "copy", 0, 0)]
    expect(rankPlaces([google, osm], waikiki).map((p) => p.id)).toEqual(["g1", "o2"])
  })

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`p${i}`, `Place ${i}`, 21.3, -157.86))
    expect(rankPlaces([many], waikiki)).toHaveLength(8)
    expect(rankPlaces([many], waikiki, 3)).toHaveLength(3)
  })

  it("given the query, keeps a far place only when its name is what was typed", () => {
    const jeju = { lat: 33.5, lng: 126.53 }
    const lotte = place("l", "Lotte Mart", 33.49, 126.49)
    const edinburgh = place("e", "Rain Jackets Direct", 55.95, -3.19)
    const atlanta = place("a", "Bring rain jackets", 33.75, -84.39)
    expect(rankPlaces([[lotte, edinburgh, atlanta]], jeju, 8, "Bring rain jackets").map((p) => p.id)).toEqual(["l", "a"])
    const osaka = place("o", "Osaka Castle", 34.69, 135.53)
    expect(rankPlaces([[osaka]], { lat: 35.68, lng: 139.76 }, 8, "osaka castle").map((p) => p.id)).toEqual(["o"])
  })

  it("counts O'ahu's North Shore as local to Honolulu", () => {
    const north = place("n", "Turtle Bay", 21.705, -157.998)
    const tokyo = place("t", "Turtle Bay Tokyo", 35.68, 139.76)
    expect(rankPlaces([[tokyo, north]], { lat: 21.3, lng: -157.86 }).map((p) => p.id)).toEqual(["n", "t"])
    expect(LOCAL_METERS).toBeGreaterThan(50_000)
  })
})

describe("nameMatches", () => {
  it("matches a name the typed words start, or a name inside what was typed", () => {
    expect(nameMatches("gyeongbok", "Gyeongbokgung Palace")).toBe(true)
    expect(nameMatches("Lotte Mart Jeju", "Lotte Mart")).toBe(true)
    expect(nameMatches("leonards", "Leonard’s Bakery")).toBe(true)
    expect(nameMatches("경복", "경복궁")).toBe(true)
    expect(nameMatches("광장시장 육회", "광장시장")).toBe(true)
  })

  it("does not match a place a search engine only related to the words", () => {
    expect(nameMatches("Bring rain jackets", "Lotte Mart")).toBe(false)
    expect(nameMatches("rain jackets", "Rainbow Jacket Shop")).toBe(false)
    expect(nameMatches("", "Lotte Mart")).toBe(false)
  })
})

describe("nameKey", () => {
  it("ignores case, accents, apostrophes and punctuation", () => {
    expect(nameKey("Leonard’s Bakery")).toBe(nameKey("LEONARDS bakery"))
    expect(nameKey("Café  Kaila!")).toBe("cafe kaila")
    expect(nameKey("광장시장")).toBe("광장시장")
  })
})

describe("localBox", () => {
  it("is a box about 110 km tall around the point, wider in longitude away from the equator", () => {
    expect(localBox({ lat: 21.3, lng: -157.86 })).toBe("-158.40,20.80,-157.32,21.80")
    expect(localBox({ lat: 0, lng: 179.9 })).toBe("179.40,-0.50,180.00,0.50")
  })
})

describe("worthAskingGoogle", () => {
  it("waits for three letters, or two of Chinese, Japanese or Korean", () => {
    expect(worthAskingGoogle("Go")).toBe(false)
    expect(worthAskingGoogle("Goh")).toBe(true)
    expect(worthAskingGoogle("명동")).toBe(true)
    expect(worthAskingGoogle("新宿")).toBe(true)
    expect(worthAskingGoogle("명")).toBe(false)
  })
})
