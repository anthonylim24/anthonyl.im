import { describe, expect, it } from "bun:test"
import {
  createGooglePlaceDetails,
  DETAILS_FIELDS,
  MAX_PHOTOS,
  nameLanguage,
  PlaceDetailsUpstreamError,
  plausibleName,
  sameName,
  toPlaceDetails,
  type RawDetails,
} from "./placeDetails"

const KEY = "test-maps-key-SECRET123"
const PALACE_ID = "ChIJod7tSseifDUR9hXHLFNGMIs"
const photoName = (n: number) => `places/${PALACE_ID}/photos/AV-0GLphoto${String(n).padStart(4, "0")}`

const palace: RawDetails = {
  id: PALACE_ID,
  displayName: { text: "Gyeongbokgung Palace" },
  formattedAddress: "161 Sajik-ro, Jongno District, Seoul, South Korea",
  location: { latitude: 37.579617, longitude: 126.977041 },
  editorialSummary: { text: "A large 14th-century royal palace with a museum & gardens." },
  rating: 4.6,
  userRatingCount: 47397,
  priceLevel: "PRICE_LEVEL_FREE",
  regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 6:00 PM", "Tuesday: Closed"] },
  websiteUri: "https://royal.khs.go.kr/ROYAL/contents/menuInfo-gbg.do?grpCode=gbg",
  internationalPhoneNumber: "+82 2-3700-3900",
  googleMapsUri: "https://maps.google.com/?cid=10029593693201569270&g_mp=CiVnb29nbGUubWFwcy5wbGFjZXM",
  primaryTypeDisplayName: { text: "Cultural landmark" },
  businessStatus: "OPERATIONAL",
  photos: Array.from({ length: 8 }, (_, i) => ({
    name: photoName(i),
    widthPx: 4800,
    heightPx: 3600,
    authorAttributions: [{ displayName: `Author ${i}`, uri: "https://maps.google.com/maps/contrib/1167" }],
  })),
}

interface Call {
  url: string
  init: RequestInit
}

/** A fake Google: Text Search, Place Details and photo media, answering from fixtures. */
function fakeGoogle({
  details = palace,
  search = [{ id: PALACE_ID, displayName: { text: "Gyeongbokgung Palace" }, location: { latitude: 37.579617, longitude: 126.977041 } }] as RawDetails[],
  detailsStatus = 200,
  failPhoto = (_n: string) => false,
  photoUri = (n: string) => `https://lh3.googleusercontent.com/place-photos/${n.split("/").pop()}=s1200`,
}: {
  details?: RawDetails
  search?: RawDetails[]
  detailsStatus?: number
  failPhoto?: (name: string) => boolean
  photoUri?: (name: string) => string
} = {}) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith("places:searchText")) return Response.json({ places: search })
    const media = url.match(/^https:\/\/places\.googleapis\.com\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media\?/)
    if (media) {
      const name = media[1]!
      if (failPhoto(name)) return new Response("nope", { status: 500 })
      return Response.json({ name: `${name}/media`, photoUri: photoUri(name) })
    }
    if (url.startsWith("https://places.googleapis.com/v1/places/")) {
      if (detailsStatus !== 200) return new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: detailsStatus })
      return Response.json(details)
    }
    return new Response("unexpected", { status: 404 })
  }) as typeof fetch
  const header = (call: Call, name: string) => new Headers(call.init.headers).get(name)
  return { fetchImpl, calls, header }
}

describe("toPlaceDetails", () => {
  it("maps every field the popover shows", () => {
    const details = toPlaceDetails(palace, [])
    expect(details).toEqual({
      placeId: PALACE_ID,
      name: "Gyeongbokgung Palace",
      summary: "A large 14th-century royal palace with a museum & gardens.",
      summarySource: "google",
      address: "161 Sajik-ro, Jongno District, Seoul, South Korea",
      rating: 4.6,
      ratingCount: 47397,
      priceLevel: 0,
      hours: ["Monday: 9:00 AM – 6:00 PM", "Tuesday: Closed"],
      website: "https://royal.khs.go.kr/ROYAL/contents/menuInfo-gbg.do?grpCode=gbg",
      phone: "+82 2-3700-3900",
      mapsUrl: "https://maps.google.com/?cid=10029593693201569270",
      typeLabel: "Cultural landmark",
      photos: [],
    })
  })

  it.each([
    ["PRICE_LEVEL_FREE", 0],
    ["PRICE_LEVEL_INEXPENSIVE", 1],
    ["PRICE_LEVEL_MODERATE", 2],
    ["PRICE_LEVEL_EXPENSIVE", 3],
    ["PRICE_LEVEL_VERY_EXPENSIVE", 4],
    ["PRICE_LEVEL_UNSPECIFIED", undefined],
    ["SOMETHING_NEW", undefined],
  ])("reads %s as %p", (level, expected) => {
    expect(toPlaceDetails({ displayName: { text: "X" }, priceLevel: level }, [])?.priceLevel).toBe(expected as never)
  })

  it("keeps only web links and drops what has no name", () => {
    const details = toPlaceDetails({ displayName: { text: "X" }, websiteUri: "javascript:alert(1)", googleMapsUri: "ftp://x" }, [])
    expect(details?.website).toBeUndefined()
    expect(details?.mapsUrl).toBeUndefined()
    expect(toPlaceDetails({ displayName: { text: "  " } }, [])).toBeNull()
  })

  it("leaves out a rating off the 1–5 scale", () => {
    expect(toPlaceDetails({ displayName: { text: "X" }, rating: 0 }, [])?.rating).toBeUndefined()
  })
})

describe("plausibleName", () => {
  it.each([
    ["Gyeongbokgung Palace", "Gyeongbokgung Palace"],
    ["gyeongbokgung", "Gyeongbokgung Palace"],
    ["Café de Flore", "Cafe de Flore"],
    ["Onion Anguk", "Cafe Onion Anguk"],
    ["Tosokchon Samgyetang", "Tosokchon Samgyetang Restaurant"],
    ["Jagalchi Fish Market", "Jagalchi Market"],
    ["경복궁", "경복궁"],
    ["一蘭", "一蘭 新宿中央東口店"],
    ["ガスト", "ガスト 渋谷駅前店"],
    ["Myeongdong Kyoja", "Myeongdong Kyoja Main"],
  ])("accepts %s as %s", (wanted, found) => {
    expect(plausibleName(wanted, found)).toBe(true)
  })

  it.each([
    ["Onion Anguk", "London Bagel Museum Anguk"],
    ["Cafe", "Cafe Onion"],
    ["Bo", "Bo Bar"],
    ["Gwangjang Market", "Namdaemun Market"],
    ["Bo Fish", "Bo Market"],
    ["경복궁", "Gyeongbokgung Palace"],
    ["", "Anything"],
    // A cuisine or kind word is never the name.
    ["Sushi Saito", "Sushi Sho"],
    ["Ramen Nagi Shinjuku", "Ramen Fuunji Shinjuku"],
    ["Kyochon Chicken Anguk", "BHC Chicken Anguk"],
    ["Gogung Bibimbap Myeongdong", "Jeonju Bibimbap Myeongdong"],
    ["Pizza Hut Itaewon", "Pizza Express Itaewon"],
    // A district both share never carries the match.
    ["Myeongdong Kyoja", "Myeongdong Hamheung Naengmyeon"],
    ["Ichiran Shibuya Tokyo", "Ippudo Shibuya Tokyo"],
    // Kana voicing marks and Thai vowel marks are part of the letter.
    ["ガスト 渋谷", "バスト 渋谷"],
    ["サバ 銀座", "サハ 銀座"],
    ["ブルーボトル 渋谷", "プルーボトル 渋谷"],
    ["ร้านกาแฟ บ้านสวน", "ร้านกาแฟ บ้านไร่"],
    // Both say what they are, and it differs.
    ["Sushi Saito", "Ramen Saito"],
    ["Gyeongbokgung Station", "Gyeongbokgung Palace"],
  ])("refuses %s as %s", (wanted, found) => {
    expect(plausibleName(wanted, found)).toBe(false)
  })
})

describe("sameName", () => {
  it.each([
    ["Bukhansan National Park", "Bukhansan National Park", true],
    ["Café de Flore", "Cafe de Flore", true],
    ["경복궁", "경복궁", true],
    // Containment is not sameness: these are kilometres apart.
    ["Seoul Forest", "Seoul", false],
    ["Hangang Park", "Yeouido Hangang Park", false],
    ["ブルーボトル", "プルーボトル", false],
  ])("%s / %s → %p", (wanted, found, same) => {
    expect(sameName(wanted, found)).toBe(same)
  })
})

describe("nameLanguage", () => {
  it.each([
    ["Gyeongbokgung Palace", "en"],
    ["Café de Flore", "en"],
    ["경복궁", "ko"],
    ["すし匠", "ja"],
    ["金閣寺", "zh"],
    ["วัดพระแก้ว", "th"],
    ["Ακρόπολη", "el"],
  ])("reads %s as %s", (name, language) => {
    expect(nameLanguage(name)).toBe(language)
  })

  it.each([
    ["Tokyo", 35.68, 139.76, "ja"],
    ["Sapporo", 43.06, 141.35, "ja"],
    ["Fukuoka", 33.59, 130.4, "ja"],
    ["Tsushima", 34.2, 129.29, "ja"],
    ["Naha", 26.21, 127.68, "ja"],
    ["Taipei", 25.03, 121.56, "zh-TW"],
    ["Hong Kong", 22.28, 114.16, "zh-TW"],
    ["Macau", 22.19, 113.54, "zh-TW"],
    ["Shanghai", 31.23, 121.47, "zh"],
    ["Shenzhen", 22.54, 114.06, "zh"],
    ["Seoul", 37.57, 126.98, "zh"],
    ["Busan", 35.1, 129.04, "zh"],
    ["Jeju", 33.5, 126.53, "zh"],
  ])("reads a Han-only name in %s as %s", (_city, lat, lng, language) => {
    expect(nameLanguage("金閣寺", { lat, lng })).toBe(language)
  })
})

describe("createGooglePlaceDetails", () => {
  it("asks Place Details for exactly its field mask, with the key in a header", async () => {
    const google = fakeGoogle()
    const lookup = createGooglePlaceDetails(KEY, google.fetchImpl)
    await lookup({ placeId: PALACE_ID })
    const details = google.calls.find((call) => call.url.includes(`/places/${PALACE_ID}?`))!
    expect(details.url).toBe(`https://places.googleapis.com/v1/places/${PALACE_ID}?languageCode=en`)
    expect(google.header(details, "X-Goog-FieldMask")).toBe(DETAILS_FIELDS)
    expect(DETAILS_FIELDS).not.toContain("places.")
    expect(DETAILS_FIELDS.split(",")).toContain("regularOpeningHours.weekdayDescriptions")
    expect(google.header(details, "X-Goog-Api-Key")).toBe(KEY)
    for (const call of google.calls) expect(call.url).not.toContain(KEY)
  })

  it("resolves up to six photos to keyless URIs with their credit", async () => {
    const google = fakeGoogle()
    const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })
    expect(place?.photos).toHaveLength(MAX_PHOTOS)
    expect(place?.photos[0]).toEqual({
      url: "https://lh3.googleusercontent.com/place-photos/AV-0GLphoto0000=s1200",
      width: 1200,
      height: 900,
      author: { name: "Author 0", uri: "https://maps.google.com/maps/contrib/1167" },
    })
    const media = google.calls.filter((call) => call.url.includes("/media?"))
    expect(media).toHaveLength(MAX_PHOTOS)
    expect(media[0]!.url).toBe(`https://places.googleapis.com/v1/${photoName(0)}/media?maxWidthPx=1200&skipHttpRedirect=true`)
    expect(google.header(media[0]!, "X-Goog-Api-Key")).toBe(KEY)
  })

  it("drops a photo that fails, an unsafe URI, and one that echoes the key", async () => {
    const google = fakeGoogle({
      failPhoto: (name) => name === photoName(1),
      photoUri: (name) =>
        name === photoName(2) ? "http://insecure.example/p.jpg" : name === photoName(3) ? `https://x.example/p.jpg?key=${KEY}` : `https://lh3.googleusercontent.com/${name.split("/").pop()}`,
    })
    const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })
    expect(place?.photos.map((photo) => photo.url)).toEqual([
      "https://lh3.googleusercontent.com/AV-0GLphoto0000",
      "https://lh3.googleusercontent.com/AV-0GLphoto0004",
      "https://lh3.googleusercontent.com/AV-0GLphoto0005",
    ])
  })

  it("never asks for a photo whose name is not Google's shape", async () => {
    const google = fakeGoogle({ details: { ...palace, photos: [{ name: "../../evil?x=1" }, { name: photoName(0) }] } })
    const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })
    expect(place?.photos).toHaveLength(1)
    expect(google.calls.some((call) => call.url.includes("evil"))).toBe(false)
  })

  it("answers no photos when the place has none", async () => {
    const google = fakeGoogle({ details: { ...palace, photos: undefined } })
    const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })
    expect(place?.photos).toEqual([])
  })

  it("answers null for a place that closed for good", async () => {
    const google = fakeGoogle({ details: { ...palace, businessStatus: "CLOSED_PERMANENTLY" } })
    expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })).toBeNull()
  })

  it("never looks a closed place up again by name: that finds a neighbour", async () => {
    const google = fakeGoogle({ details: { ...palace, businessStatus: "CLOSED_PERMANENTLY" } })
    const lookup = createGooglePlaceDetails(KEY, google.fetchImpl)
    const query = { placeId: PALACE_ID, fallback: { name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } } }
    expect(await lookup(query)).toBeNull()
    // From the cache too.
    expect(await lookup(query)).toBeNull()
    expect(google.calls.some((call) => call.url.endsWith("places:searchText"))).toBe(false)
    expect(google.calls).toHaveLength(1)
  })

  it("follows a closed place to where it moved, once", async () => {
    const OLD = "ChIJoldClosedPlace0001"
    const NEW = "ChIJnewHomeOfPlace0001"
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes(`/places/${OLD}?`)) return Response.json({ id: OLD, displayName: { text: "Old" }, businessStatus: "CLOSED_PERMANENTLY", movedPlaceId: NEW })
      if (url.includes(`/places/${NEW}?`)) return Response.json({ ...palace, id: NEW, photos: undefined })
      return new Response("unexpected", { status: 500 })
    }) as typeof fetch
    const lookup = createGooglePlaceDetails(KEY, fetchImpl)
    expect((await lookup({ placeId: OLD }))?.placeId).toBe(NEW)
    expect((await lookup({ placeId: OLD }))?.placeId).toBe(NEW)
    expect(calls).toHaveLength(2)
    expect(DETAILS_FIELDS.split(",")).toContain("movedPlaceId")
  })

  it("does not chase a second move", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = String(input).match(/places\/([^?]+)\?/)![1]!
      return Response.json({ id, displayName: { text: "Gone" }, businessStatus: "CLOSED_PERMANENTLY", movedPlaceId: `${id}x` })
    }) as typeof fetch
    expect(await createGooglePlaceDetails(KEY, fetchImpl)({ placeId: PALACE_ID })).toBeNull()
  })

  it("asks only for fields it shows", () => {
    expect(DETAILS_FIELDS.split(",")).not.toContain("location")
  })

  it("refuses redirects on every call that carries the key", async () => {
    const google = fakeGoogle()
    await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } })
    expect(google.calls.length).toBeGreaterThan(2)
    for (const call of google.calls) expect(call.init.redirect).toBe("error")
  })

  it("throws the status alone when Google refuses, quoting neither body nor key", async () => {
    const google = fakeGoogle({ detailsStatus: 403 })
    const lookup = createGooglePlaceDetails(KEY, google.fetchImpl)
    const err = await lookup({ placeId: PALACE_ID }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PlaceDetailsUpstreamError)
    expect((err as Error).message).toBe("place details 403")
  })

  it("answers null for an id Google no longer knows, and keeps that answer", async () => {
    const google = fakeGoogle({ detailsStatus: 404 })
    const lookup = createGooglePlaceDetails(KEY, google.fetchImpl)
    expect(await lookup({ placeId: PALACE_ID })).toBeNull()
    expect(await lookup({ placeId: PALACE_ID })).toBeNull()
    expect(google.calls).toHaveLength(1)
  })

  it("finds the place by name and point when its id is gone", async () => {
    const moved = "ChIJmovedPlaceId0001"
    const base = fakeGoogle()
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(`/places/${moved}?`) ? new Response("", { status: 404 }) : base.fetchImpl(input, init)) as typeof fetch
    const place = await createGooglePlaceDetails(KEY, fetchImpl)({
      placeId: moved,
      fallback: { name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } },
    })
    expect(place?.placeId).toBe(PALACE_ID)
  })

  it("keeps a 400 a failure, so a broken field mask is never an empty place", async () => {
    const google = fakeGoogle({ detailsStatus: 400 })
    await expect(createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })).rejects.toBeInstanceOf(PlaceDetailsUpstreamError)
  })

  // Google's real answer for a dead id (measured live): 400, not 404.
  const invalidId = (id: string) =>
    new Response(JSON.stringify({ error: { code: 400, message: `The provided Place ID: ${id} is not valid.\n`, status: "INVALID_ARGUMENT" } }), { status: 400 })

  it("answers null for the 400 Google gives an id it does not know", async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return invalidId(PALACE_ID)
    }) as typeof fetch
    const lookup = createGooglePlaceDetails(KEY, fetchImpl)
    expect(await lookup({ placeId: PALACE_ID })).toBeNull()
    expect(await lookup({ placeId: PALACE_ID })).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it("falls back to the name and point after that 400", async () => {
    const dead = "ChIJod7tSseifDUR9hXHLFNGZZZ"
    const base = fakeGoogle()
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(`/places/${dead}?`) ? invalidId(dead) : base.fetchImpl(input, init)) as typeof fetch
    const place = await createGooglePlaceDetails(KEY, fetchImpl)({ placeId: dead, fallback: { name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } } })
    expect(place?.placeId).toBe(PALACE_ID)
  })

  it.each([
    ["no longer valid", { code: 400, message: "The provided Place ID is no longer valid. Please refresh cached Place IDs.", status: "INVALID_ARGUMENT" }],
    ["invalid place id", { code: 400, message: "Invalid place ID.", status: "INVALID_ARGUMENT" }],
    ["NOT_FOUND", { code: 400, message: "Requested entity was not found.", status: "NOT_FOUND" }],
  ])("reads the %s wording as an unknown id", async (_wording, error) => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error }), { status: 400 })) as typeof fetch
    expect(await createGooglePlaceDetails(KEY, fetchImpl)({ placeId: PALACE_ID })).toBeNull()
  })

  it("keeps a field-mask 400 a failure", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 400, message: "Request contains an invalid argument.", details: [{ fieldViolations: [{ field: "id,notAField" }] }] } }), { status: 400 })) as typeof fetch
    const err = await createGooglePlaceDetails(KEY, fetchImpl)({ placeId: PALACE_ID }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PlaceDetailsUpstreamError)
    expect((err as PlaceDetailsUpstreamError).unknownId).toBe(false)
  })

  describe("with no place id", () => {
    const near = { lat: 37.5796, lng: 126.977 }

    it("searches near the point for the id only, then reads its details", async () => {
      const google = fakeGoogle()
      const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung", near })
      expect(place?.placeId).toBe(PALACE_ID)
      const search = google.calls[0]!
      expect(search.url).toBe("https://places.googleapis.com/v1/places:searchText")
      expect(google.header(search, "X-Goog-FieldMask")).toBe("places.id,places.displayName,places.location,places.primaryType")
      const body = JSON.parse(String(search.init.body))
      expect(body).toMatchObject({ textQuery: "Gyeongbokgung", pageSize: 1, languageCode: "en" })
      expect(body.locationBias.circle.center).toEqual({ latitude: 37.5796, longitude: 126.977 })
    })

    it("answers null when the top hit is far from the pin", async () => {
      const google = fakeGoogle({
        // Same name, about 1.1 km away.
        search: [{ id: PALACE_ID, displayName: { text: "Gyeongbokgung Palace" }, location: { latitude: 37.5896, longitude: 126.977 } }],
      })
      expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung Palace", near })).toBeNull()
      expect(google.calls).toHaveLength(1)
    })

    it("takes a park, mountain or neighbourhood of the same name from kilometres off", async () => {
      const park = { lat: 37.6584, lng: 126.978 }
      // Google's point for the park, 4.7 km from where the idea was pinned (measured).
      const hit = { id: "ChIJBukhansanNationalPk", displayName: { text: "Bukhansan National Park" }, location: { latitude: 37.6994, longitude: 126.9906 }, primaryType: "national_park" }
      const google = fakeGoogle({ search: [hit] })
      expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Bukhansan National Park", near: park })).not.toBeNull()
      expect(google.calls[1]!.url).toContain(`/places/${hit.id}`)

      // Only on the same name: a merely similar one stays local.
      const similar = fakeGoogle({ search: [{ ...hit, displayName: { text: "Bukhansan Dulle-gil Trail Park" } }] })
      expect(await createGooglePlaceDetails(KEY, similar.fetchImpl)({ name: "Bukhansan Park", near: park })).toBeNull()
      // And never past the area radius, or for a business.
      const far = fakeGoogle({ search: [{ ...hit, location: { latitude: 37.79, longitude: 126.99 } }] })
      expect(await createGooglePlaceDetails(KEY, far.fetchImpl)({ name: "Bukhansan National Park", near: park })).toBeNull()
      const cafe = fakeGoogle({ search: [{ ...hit, displayName: { text: "Cafe Onion" }, primaryType: "cafe" }] })
      expect(await createGooglePlaceDetails(KEY, cafe.fetchImpl)({ name: "Cafe Onion", near: park })).toBeNull()
    })

    it.each([
      // A city is not a park, and containment is not the same name (measured distances).
      ["Seoul Forest", { lat: 37.5444, lng: 127.0374 }, { id: "ChIJSeoulCityPlaceId01", displayName: { text: "Seoul" }, location: { latitude: 37.5503, longitude: 126.9971 }, primaryType: "locality" }],
      ["Hangang Park", { lat: 37.5172, lng: 126.9938 }, { id: "ChIJYeouidoHangangPark1", displayName: { text: "Yeouido Hangang Park" }, location: { latitude: 37.5284, longitude: 126.9326 }, primaryType: "park" }],
    ])("never takes %s for a bigger area kilometres off", async (name, at, hit) => {
      const google = fakeGoogle({ search: [hit as RawDetails] })
      expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ name, near: at })).toBeNull()
      expect(google.calls).toHaveLength(1)
    })

    it("answers null when the top hit is close but another place", async () => {
      const google = fakeGoogle({
        search: [{ id: "ChIJotherPlaceNearby01", displayName: { text: "Gwanghwamun Gate" }, location: { latitude: 37.5797, longitude: 126.9771 } }],
      })
      expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung Palace", near })).toBeNull()
      expect(google.calls).toHaveLength(1)
    })

    it("compares a Hangul name with Google's Hangul name", async () => {
      const google = fakeGoogle({
        search: [{ id: PALACE_ID, displayName: { text: "경복궁" }, location: { latitude: 37.579617, longitude: 126.977041 } }],
      })
      const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "경복궁", near })
      expect(place?.placeId).toBe(PALACE_ID)
      expect(JSON.parse(String(google.calls[0]!.init.body)).languageCode).toBe("ko")
      // The details themselves stay in English.
      expect(google.calls[1]!.url).toEndWith("?languageCode=en")
    })

    it("answers null when nothing is found", async () => {
      const google = fakeGoogle({ search: [] })
      expect(await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung Palace", near })).toBeNull()
    })
  })

  describe("deadlines", () => {
    const timeouts = { totalMs: 120, stepMs: 80, photoMs: 50, reserveMs: 10 }
    /** Never answers; rejects when its signal aborts, as fetch does. */
    const hang = (init: RequestInit = {}) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))

    it("gives up on the whole lookup at its deadline, however many calls it takes", async () => {
      // Each call takes just under its own step limit: an unknown id, then search, then details would run past the total.
      const slow = (ms: number, answer: () => Response) => (init: RequestInit = {}) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(answer()), ms)
          init.signal?.addEventListener("abort", () => (clearTimeout(timer), reject(init.signal!.reason)), { once: true })
        })
      const base = fakeGoogle()
      const dead = "ChIJdeadPlaceIdentifier"
      const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes(`/places/${dead}?`)) return slow(50, () => new Response("", { status: 404 }))(init)
        return slow(50, () => new Response(null))(init).then(() => base.fetchImpl(input, init))
      }) as typeof fetch
      const err = await createGooglePlaceDetails(KEY, fetchImpl, { timeouts })({
        placeId: dead,
        fallback: { name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } },
      }).catch((e: unknown) => e)
      expect((err as Error).name).toBe("TimeoutError")
    })

    it("answers without the photos that do not arrive in time", async () => {
      const base = fakeGoogle()
      const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).includes("/media?") ? hang(init) : base.fetchImpl(input, init)) as typeof fetch
      const place = await createGooglePlaceDetails(KEY, fetchImpl, { timeouts })({ placeId: PALACE_ID })
      expect(place?.name).toBe("Gyeongbokgung Palace")
      expect(place?.photos).toEqual([])
    })

    it("stops when the caller hangs up, and keeps nothing", async () => {
      const controller = new AbortController()
      const base = fakeGoogle()
      let hung = true
      const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => (hung ? hang(init) : base.fetchImpl(input, init))) as typeof fetch
      const lookup = createGooglePlaceDetails(KEY, fetchImpl, { timeouts: { ...timeouts, totalMs: 5_000, stepMs: 5_000 } })
      const pending = lookup({ placeId: PALACE_ID }, controller.signal)
      controller.abort()
      expect(((await pending.catch((e: unknown) => e)) as Error).name).toBe("AbortError")
      hung = false
      expect((await lookup({ placeId: PALACE_ID }))?.name).toBe("Gyeongbokgung Palace")
    })
  })

  describe("cache", () => {
    it("reuses an answer until it lapses", async () => {
      let clock = 0
      const google = fakeGoogle()
      const lookup = createGooglePlaceDetails(KEY, google.fetchImpl, { ttlMs: 1_000, now: () => clock })
      await lookup({ placeId: PALACE_ID })
      const first = google.calls.length
      await lookup({ placeId: PALACE_ID })
      expect(google.calls.length).toBe(first)
      clock = 1_001
      await lookup({ placeId: PALACE_ID })
      expect(google.calls.length).toBe(first * 2)
    })

    it("remembers a no-match too, and shares answers between a name and its id", async () => {
      const google = fakeGoogle()
      const lookup = createGooglePlaceDetails(KEY, google.fetchImpl)
      await lookup({ name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } })
      const after = google.calls.length
      await lookup({ placeId: PALACE_ID })
      await lookup({ name: "Gyeongbokgung", near: { lat: 37.5796, lng: 126.977 } })
      expect(google.calls.length).toBe(after)

      const none = fakeGoogle({ search: [] })
      const lookupNone = createGooglePlaceDetails(KEY, none.fetchImpl)
      await lookupNone({ name: "Nowhere", near: { lat: 1, lng: 1 } })
      await lookupNone({ name: "Nowhere", near: { lat: 1, lng: 1 } })
      expect(none.calls).toHaveLength(1)
    })

    it("never keeps a failure", async () => {
      let status = 500
      const google = fakeGoogle()
      const flaky = (async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).includes(`/places/${PALACE_ID}?`) && status !== 200 ? new Response("", { status }) : google.fetchImpl(input, init)) as typeof fetch
      const lookup = createGooglePlaceDetails(KEY, flaky)
      await expect(lookup({ placeId: PALACE_ID })).rejects.toBeInstanceOf(PlaceDetailsUpstreamError)
      status = 200
      expect((await lookup({ placeId: PALACE_ID }))?.name).toBe("Gyeongbokgung Palace")
    })

    it("keeps an answer missing a photo only briefly", async () => {
      let clock = 0
      let fail = true
      const google = fakeGoogle({ failPhoto: (name) => fail && name === photoName(0) })
      const lookup = createGooglePlaceDetails(KEY, google.fetchImpl, { now: () => clock })
      expect((await lookup({ placeId: PALACE_ID }))?.photos).toHaveLength(MAX_PHOTOS - 1)
      fail = false
      clock = 3 * 60_000
      expect((await lookup({ placeId: PALACE_ID }))?.photos).toHaveLength(MAX_PHOTOS)
    })

    it("drops the oldest entry when full", async () => {
      const google = fakeGoogle()
      const lookup = createGooglePlaceDetails(KEY, google.fetchImpl, { maxEntries: 1 })
      await lookup({ placeId: PALACE_ID })
      await lookup({ placeId: "ChIJanotherPlaceId000" })
      const before = google.calls.length
      await lookup({ placeId: PALACE_ID })
      expect(google.calls.length).toBeGreaterThan(before)
    })
  })

  it("never puts the key in what it answers", async () => {
    const google = fakeGoogle()
    const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ placeId: PALACE_ID })
    expect(JSON.stringify(place)).not.toContain(KEY)
  })
})
