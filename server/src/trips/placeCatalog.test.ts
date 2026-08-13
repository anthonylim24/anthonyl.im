import { describe, expect, test } from "bun:test"
import {
  collectCatalogPlaces,
  groupCatalogPlaces,
  instagramSourceUrl,
  UNSPECIFIED_CITY,
  UNSPECIFIED_NEIGHBORHOOD,
} from "./placeCatalog"
import type { ItineraryItem, Trip, TripDay } from "./types"

function place(partial: Partial<ItineraryItem> & Pick<ItineraryItem, "id" | "title">): ItineraryItem {
  return {
    kind: "place",
    status: "none",
    createdBy: "user",
    ...partial,
  }
}

function day(partial: Partial<TripDay> & Pick<TripDay, "id" | "date">): TripDay {
  return { items: [], ...partial }
}

function trip(partial: Partial<Trip> & Pick<Trip, "id" | "name">): Trip {
  return {
    ownerId: "u1",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "active",
    tags: [],
    collaborators: [],
    days: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  }
}

const IG = "https://www.instagram.com/reel/ABC/"

describe("instagramSourceUrl", () => {
  test("returns the Instagram link on an item", () => {
    expect(instagramSourceUrl(place({ id: "a", title: "Cafe", links: [IG] }))).toBe(IG)
  })

  test("ignores non-Instagram links", () => {
    expect(
      instagramSourceUrl(place({ id: "a", title: "Cafe", links: ["https://maps.google.com/?q=cafe"] })),
    ).toBeUndefined()
  })
})

describe("collectCatalogPlaces", () => {
  test("keeps only Instagram-sourced places and groups city/neighborhood with fallbacks", () => {
    const places = collectCatalogPlaces([
      trip({
        id: "tokyo",
        name: "Tokyo Long Weekend",
        days: [
          day({
            id: "d1",
            date: "2026-07-10",
            city: "Tokyo",
            neighborhoods: ["Shibuya", "Ebisu"],
            items: [
              place({
                id: "p1",
                title: "Sushi Saito",
                links: [IG],
                location: { name: "Sushi Saito", source: "user", category: "restaurant" },
              }),
              place({ id: "p2", title: "User cafe", links: ["https://example.com"] }),
              {
                id: "n1",
                kind: "note",
                title: "Pack adapter",
                status: "none",
                createdBy: "user",
                links: [IG],
              },
            ],
          }),
          day({
            id: "d2",
            date: "2026-07-11",
            items: [
              place({
                id: "p3",
                title: "Hidden Bar",
                links: ["https://www.instagram.com/p/XYZ/"],
              }),
            ],
          }),
        ],
      }),
    ])

    expect(places.map((p) => p.name).sort()).toEqual(["Hidden Bar", "Sushi Saito"])
    const sushi = places.find((p) => p.name === "Sushi Saito")!
    expect(sushi.city).toBe("Tokyo")
    expect(sushi.neighborhood).toBe("Shibuya · Ebisu")
    expect(sushi.sourceUrl).toBe(IG)

    const hidden = places.find((p) => p.name === "Hidden Bar")!
    expect(hidden.city).toBe(UNSPECIFIED_CITY)
    expect(hidden.neighborhood).toBe(UNSPECIFIED_NEIGHBORHOOD)
  })

  test("sorts by trip, city, neighborhood, then name", () => {
    const places = collectCatalogPlaces([
      trip({
        id: "b",
        name: "Busan",
        days: [
          day({
            id: "d1",
            date: "2026-06-01",
            city: "Busan",
            neighborhoods: ["Haeundae"],
            items: [
              place({ id: "p1", title: "Zebra", links: [IG] }),
              place({ id: "p2", title: "Apple", links: [IG] }),
            ],
          }),
        ],
      }),
      trip({
        id: "a",
        name: "Tokyo",
        days: [
          day({
            id: "d1",
            date: "2026-07-10",
            city: "Tokyo",
            neighborhoods: ["Asakusa"],
            items: [place({ id: "p3", title: "Sensoji", links: [IG] })],
          }),
        ],
      }),
    ])
    expect(places.map((p) => `${p.tripName}:${p.name}`)).toEqual([
      "Busan:Apple",
      "Busan:Zebra",
      "Tokyo:Sensoji",
    ])
  })
})

describe("groupCatalogPlaces", () => {
  test("nests a flat slice into trip → city → neighborhood", () => {
    const groups = groupCatalogPlaces(
      collectCatalogPlaces([
        trip({
          id: "tokyo",
          name: "Tokyo",
          days: [
            day({
              id: "d1",
              date: "2026-07-10",
              city: "Tokyo",
              neighborhoods: ["Asakusa"],
              items: [place({ id: "p1", title: "Sensoji", links: [IG] })],
            }),
            day({
              id: "d2",
              date: "2026-07-11",
              city: "Tokyo",
              neighborhoods: ["Shibuya"],
              items: [place({ id: "p2", title: "Shrine", links: [IG] })],
            }),
          ],
        }),
      ]),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tripName).toBe("Tokyo")
    expect(groups[0]!.cities).toHaveLength(1)
    expect(groups[0]!.cities[0]!.city).toBe("Tokyo")
    expect(groups[0]!.cities[0]!.neighborhoods.map((n) => n.neighborhood)).toEqual(["Asakusa", "Shibuya"])
  })
})
