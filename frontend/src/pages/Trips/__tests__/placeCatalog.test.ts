import { describe, expect, it } from "vitest"
import { collectCatalogPlaces, groupCatalogPlaces, UNSPECIFIED_CITY } from "../placeCatalog"
import type { ItineraryItem, Trip, TripDay } from "../types"

const IG = "https://www.instagram.com/reel/ABC/"

function place(partial: Partial<ItineraryItem> & Pick<ItineraryItem, "id" | "title">): ItineraryItem {
  return { kind: "place", status: "none", createdBy: "user", ...partial }
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

describe("collectCatalogPlaces", () => {
  it("keeps Instagram places and falls back for missing city", () => {
    const places = collectCatalogPlaces([
      trip({
        id: "tokyo",
        name: "Tokyo",
        days: [
          day({
            id: "d1",
            date: "2026-07-10",
            city: "Tokyo",
            neighborhoods: ["Shibuya"],
            items: [
              place({ id: "p1", title: "Sushi", links: [IG] }),
              place({ id: "p2", title: "Cafe", links: ["https://maps.google.com"] }),
            ],
          }),
          day({
            id: "d2",
            date: "2026-07-11",
            items: [place({ id: "p3", title: "Bar", links: [IG] })],
          }),
        ],
      }),
    ])
    expect(places.map((p) => p.name)).toEqual(["Sushi", "Bar"])
    expect(places.find((p) => p.name === "Sushi")!.city).toBe("Tokyo")
    expect(places.find((p) => p.name === "Bar")!.city).toBe(UNSPECIFIED_CITY)
  })

  it("groups trip → city → neighborhood", () => {
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
          ],
        }),
      ]),
    )
    expect(groups[0]!.tripName).toBe("Tokyo")
    expect(groups[0]!.cities[0]!.city).toBe("Tokyo")
    expect(groups[0]!.cities[0]!.neighborhoods[0]!.neighborhood).toBe("Asakusa")
  })
})
