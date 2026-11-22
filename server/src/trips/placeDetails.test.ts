import { describe, expect, it } from "bun:test"
import {
  createGooglePlaceDetails,
  DETAILS_FIELDS,
  MAX_PHOTOS,
  nameLanguage,
  PlaceDetailsUpstreamError,
  plausibleName,
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
  ])("accepts %s as %s", (wanted, found) => {
    expect(plausibleName(wanted, found)).toBe(true)
  })

  it.each([
    ["Onion Anguk", "London Bagel Museum Anguk"],
    ["Cafe", "Cafe Onion"],
    ["Bo", "Bo Bar"],
    ["Gwangjang Market", "Namdaemun Market"],
    ["경복궁", "Gyeongbokgung Palace"],
    ["", "Anything"],
  ])("refuses %s as %s", (wanted, found) => {
    expect(plausibleName(wanted, found)).toBe(false)
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

  describe("with no place id", () => {
    const near = { lat: 37.5796, lng: 126.977 }

    it("searches near the point for the id only, then reads its details", async () => {
      const google = fakeGoogle()
      const place = await createGooglePlaceDetails(KEY, google.fetchImpl)({ name: "Gyeongbokgung", near })
      expect(place?.placeId).toBe(PALACE_ID)
      const search = google.calls[0]!
      expect(search.url).toBe("https://places.googleapis.com/v1/places:searchText")
      expect(google.header(search, "X-Goog-FieldMask")).toBe("places.id,places.displayName,places.location")
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
