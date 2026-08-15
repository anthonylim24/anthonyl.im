import { describe, expect, it } from "vitest"
import { findMentionedStops, findTripStop, resolveMove, stopToConciergePlace } from "../conciergeMoves"
import type { ItineraryItem, Trip, TripDay } from "../types"

function item(partial: Partial<ItineraryItem> & Pick<ItineraryItem, "id" | "title">): ItineraryItem {
  return {
    kind: "place",
    status: "none",
    createdBy: "user",
    ...partial,
  }
}

function trip(): Trip {
  const days: TripDay[] = [
    {
      id: "d1",
      date: "2026-07-10",
      title: "Arrival",
      items: [
        item({
          id: "a",
          title: "Senso-ji",
          location: { name: "Senso-ji", source: "user", lat: 35.7, lng: 139.8, category: "landmark" },
        }),
      ],
    },
    {
      id: "d2",
      date: "2026-07-11",
      title: "Tsukiji",
      items: [item({ id: "b", title: "Sushi Saito", kind: "reservation", status: "booked" })],
    },
  ]
  return {
    id: "tokyo",
    ownerId: "u1",
    name: "Tokyo",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

describe("findTripStop", () => {
  it("matches a title case-insensitively and prefers the named day", () => {
    const t = trip()
    expect(findTripStop(t, "senso-ji")?.item.id).toBe("a")
    expect(findTripStop(t, "Sushi Saito", "d2")?.day.id).toBe("d2")
  })
})

describe("findMentionedStops", () => {
  it("finds itinerary names in the reply and skips excluded ones", () => {
    const t = trip()
    const found = findMentionedStops("Start at Senso-ji, then Sushi Saito.", t, ["Sushi Saito"])
    expect(found.map((s) => s.item.id)).toEqual(["a"])
  })
})

describe("resolveMove", () => {
  it("resolves remove / move / set_time against the live trip", () => {
    const t = trip()
    expect(resolveMove(t, { type: "remove", name: "Senso-ji" })?.label).toContain("Remove Senso-ji")
    expect(resolveMove(t, { type: "move", name: "Senso-ji", toDayId: "d2" })?.toDay?.id).toBe("d2")
    expect(resolveMove(t, { type: "set_time", name: "Sushi Saito", time: "12:30" })?.label).toContain("12:30")
    expect(resolveMove(t, { type: "move", name: "Missing", toDayId: "d2" })).toBeNull()
  })
})

describe("stopToConciergePlace", () => {
  it("copies location fields onto a concierge place", () => {
    const t = trip()
    const place = stopToConciergePlace({ day: t.days[0]!, item: t.days[0]!.items[0]! })
    expect(place).toMatchObject({
      name: "Senso-ji",
      dayId: "d1",
      itemId: "a",
      lat: 35.7,
      category: "landmark",
    })
  })
})
