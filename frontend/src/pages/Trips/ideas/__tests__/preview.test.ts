import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { ideaPreview, streetLine } from "../preview"
import { clearPlaceDetailsCache, detailsTarget, loadPlaceDetails } from "../placeDetailsApi"

const SEOUL = { lat: 37.5665, lng: 126.978 }
const seoulDay: TripDay = {
  id: "d1",
  date: "2026-05-01",
  city: "Seoul",
  items: [makeItem({ id: "palace", title: "Palace", location: { name: "Palace", source: "user", ...SEOUL } })],
}
const trip = makeTrip({ destinations: ["Seoul"], days: [seoulDay] })

function market(extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return makeItem({
    id: "market",
    title: "Gwangjang Market",
    notes: "\n  Try the bindaetteok at stall 17\nThen the mayak gimbap",
    location: { name: "Gwangjang Market", address: "88 Changgyeonggung-ro, Jongno District, Seoul, South Korea", lat: 37.57, lng: 126.9996, category: "market", source: "user" },
    ...extra,
  })
}

const getToken = async () => "token"

beforeEach(() => clearPlaceDetailsCache())
afterEach(() => vi.restoreAllMocks())

describe("ideaPreview", () => {
  it("says what the place is, where, and the traveller's first note", () => {
    expect(ideaPreview(market(), trip)).toEqual({
      name: "Gwangjang Market",
      theme: "food",
      area: "Seoul",
      street: "88 Changgyeonggung-ro, Jongno District",
      note: "Try the bindaetteok at stall 17",
      photo: null,
    })
  })

  it("files it under the traveller's own category", () => {
    expect(ideaPreview(market({ theme: "shopping" }), trip).theme).toBe("shopping")
  })

  it("never asks for a photo, and shows one already loaded for its details", async () => {
    const photo = { url: "https://images.example/market.jpg", author: { name: "Min Ji" } }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ place: { name: "Gwangjang Market", photos: [photo] } }), { headers: { "content-type": "application/json" } }),
    )
    expect(ideaPreview(market(), trip).photo).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()

    await loadPlaceDetails(getToken, detailsTarget(market())!)
    const calls = fetchSpy.mock.calls.length
    expect(ideaPreview(market(), trip).photo).toEqual(photo)
    expect(fetchSpy.mock.calls.length).toBe(calls)
  })

  it("names no area for a place far from the trip with no town in its address", () => {
    const far = market({ location: { name: "Somewhere", lat: 10, lng: 10, source: "user" } })
    expect(ideaPreview(far, trip)).toMatchObject({ area: null, street: null })
  })
})

describe("streetLine", () => {
  it("is the address up to the area, without the place's own name", () => {
    expect(streetLine("Gwangjang Market, 88 Changgyeonggung-ro, Seoul 03195, South Korea", "Seoul", "Gwangjang Market")).toBe("88 Changgyeonggung-ro")
  })

  it("keeps the first two parts when the area is not in the address", () => {
    expect(streetLine("1 Rua Augusta, Baixa, Lisboa, Portugal", null, "Arco")).toBe("1 Rua Augusta, Baixa")
  })

  it("is nothing when the address only names the area", () => {
    expect(streetLine("Seoul, South Korea", "Seoul", "Seoul Forest")).toBeNull()
    expect(streetLine(undefined, "Seoul", "X")).toBeNull()
  })
})
