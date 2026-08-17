import { describe, expect, it } from "vitest"
import {
  formatDistance,
  formatWalkMinutes,
  haversineMeters,
  itemToReservation,
  nextMappedItem,
  upcomingReservations,
  walkLegBetween,
} from "../reservationView"
import type { ItineraryItem, TripDay } from "../types"

function place(partial: Partial<ItineraryItem> & Pick<ItineraryItem, "id" | "title">): ItineraryItem {
  return {
    kind: "place",
    status: "none",
    createdBy: "user",
    ...partial,
  }
}

function reservation(partial: Partial<ItineraryItem> & Pick<ItineraryItem, "id" | "title">): ItineraryItem {
  return {
    kind: "reservation",
    status: "booked",
    createdBy: "user",
    reservation: { type: "meal", status: "confirmed" },
    ...partial,
  }
}

const day: TripDay = { id: "day-1", date: "2026-07-10", items: [] }

describe("itemToReservation", () => {
  it("returns null for non-reservation items", () => {
    expect(itemToReservation(place({ id: "p1", title: "Senso-ji" }), day, 1)).toBeNull()
  })

  it("projects booking fields onto the Korea card shape", () => {
    const item = reservation({
      id: "r1",
      title: "Ichiran",
      time: "12:30",
      endTime: "13:30",
      notes: "Tonkotsu, extra spice.",
      location: { name: "Ichiran Shibuya", address: "1-22-7 Jinnan", source: "user" },
      reservation: {
        type: "meal",
        status: "confirmed",
        confirmation: "ICH-22",
        contact: "+81 3 1234 5678",
        url: "https://ichiran.com",
      },
    })
    expect(itemToReservation(item, day, 2)).toEqual({
      id: "r1",
      date: "2026-07-10",
      time: "12:30",
      type: "meal",
      status: "confirmed",
      title: "Ichiran",
      subtitle: "Ichiran Shibuya · Until 13:30",
      address: "1-22-7 Jinnan",
      contact: "+81 3 1234 5678",
      url: "https://ichiran.com",
      notes: "Tonkotsu, extra spice.\nConfirmation ICH-22",
      dayNumber: 2,
    })
  })

  it("falls back to booking url as contact and treats unknown types as experience", () => {
    const item = reservation({
      id: "r2",
      title: "Mystery",
      links: ["https://example.com/book"],
      reservation: { type: "spaceship", status: "maybe" } as unknown as ItineraryItem["reservation"],
    })
    const card = itemToReservation(item, day, 1)
    expect(card?.type).toBe("experience")
    expect(card?.status).toBe("pending")
    expect(card?.contact).toBe("https://example.com/book")
    expect(card?.url).toBe("https://example.com/book")
  })
})

describe("upcomingReservations", () => {
  it("skips days before today", () => {
    const days: TripDay[] = [
      { id: "d1", date: "2026-07-09", items: [reservation({ id: "past", title: "Yesterday" })] },
      { id: "d2", date: "2026-07-10", items: [reservation({ id: "today", title: "Tonight" })] },
    ]
    expect(upcomingReservations(days, "2026-07-10").map((row) => row.item.id)).toEqual(["today"])
  })
})

describe("walk legs", () => {
  it("measures a known 1-degree latitude span", () => {
    const meters = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(meters).toBeGreaterThan(110_000)
    expect(meters).toBeLessThan(112_000)
  })

  it("formats distance and walk copy without em dashes", () => {
    expect(formatDistance(80)).toBe("80 m")
    expect(formatDistance(1_240)).toBe("1.2 km")
    expect(formatDistance(12_400)).toBe("12 km")
    expect(formatWalkMinutes(80)).toBe("1 min walk")
    expect(formatWalkMinutes(4_860)).toBe("1h walk")
    expect(formatWalkMinutes(5_670)).toBe("1h 10m walk")
    expect(formatDistance(80)).not.toMatch(/—|--/)
    expect(formatWalkMinutes(5_670)).not.toMatch(/—|--/)
  })

  it("returns null when either pin is missing or the hop is under 30m", () => {
    expect(walkLegBetween(undefined, { lat: 35.71, lng: 139.8 })).toBeNull()
    expect(walkLegBetween({ lat: 35.71, lng: 139.8 }, { lat: 35.71001, lng: 139.8 })).toBeNull()
  })

  it("finds the next mapped stop in itinerary order", () => {
    const items = [
      place({ id: "a", title: "Gate", location: { name: "Gate", source: "user" } }),
      place({ id: "b", title: "Temple", location: { name: "Temple", lat: 35.71, lng: 139.8, source: "user" } }),
      place({ id: "c", title: "Cafe", location: { name: "Cafe", lat: 35.72, lng: 139.8, source: "user" } }),
    ]
    expect(nextMappedItem(items, "a")?.id).toBe("b")
    expect(nextMappedItem(items, "b")?.id).toBe("c")
    expect(nextMappedItem(items, "c")).toBeUndefined()
    const walk = walkLegBetween(items[1]!.location, items[2]!.location)
    expect(walk?.walk).toMatch(/min walk|h walk/)
    expect(walk?.distance).toMatch(/m|km/)
  })
})
