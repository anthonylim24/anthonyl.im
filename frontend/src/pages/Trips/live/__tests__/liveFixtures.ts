import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { addDays } from "../../meta"
import type { ItineraryItem, Trip, TripDay } from "../../types"

// A 12-day Seoul and Busan trip (26 May – 6 Jun 2026, Asia/Seoul, UTC+9 all
// year) shared by the live-trip tests. Day 3 (Thu 28 May) is a full day of
// timed stops; day 1 opens with bookings; day 4 starts with a train.

/** A pinned place on one meridian: 0.01° of latitude is about 1,112 m. */
export function place(id: string, title: string, lat: number, extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return makeItem({ id, title, location: { name: title, lat, lng: 126.98, source: "user" }, ...extra })
}

// Day 3: four timed stops with an untimed note among them, then one place
// parked under "To schedule" (it has a time, and must still be ignored).
export const breakfast = place("breakfast", "Onion Anguk", 37.57, { time: "09:00" })
export const bukchon = place("bukchon", "Bukchon Hanok Village", 37.58, { time: "10:30", endTime: "12:30" })
export const errand = makeItem({ id: "errand", kind: "note", title: "Top up T-money" })
export const palace = place("palace", "Gyeongbokgung Palace", 37.59, { time: "14:00" })
export const market = place("market", "Gwangjang Market", 37.62, { time: "19:00" })
export const parkedHeading = makeItem({ id: "parked", kind: "section", title: "To schedule" })
export const parked = place("ikseon", "Ikseon-dong", 37.574, { time: "20:00" })

export const flight = makeItem({
  id: "flight",
  kind: "reservation",
  title: "Flight UA 893",
  time: "10:40",
  reservation: { type: "flight", status: "confirmed" },
})
export const hotel = makeItem({ id: "hotel", kind: "reservation", title: "Hotel check-in", reservation: { type: "hotel", status: "confirmed" } })
export const ktx = place("ktx", "KTX to Busan", 37.5547, { kind: "reservation", time: "08:10", reservation: { type: "transit", status: "confirmed" } })

export function seoulTrip(overrides: Partial<Trip> = {}): Trip {
  const start = "2026-05-26"
  const days: TripDay[] = Array.from({ length: 12 }, (_, i) => ({
    id: `d${i + 1}`,
    date: addDays(start, i),
    city: i < 6 ? "Seoul" : "Busan",
    items: [],
  }))
  days[0]!.items = [hotel, flight]
  days[2]!.items = [breakfast, bukchon, errand, palace, market, parkedHeading, parked]
  days[3]!.items = [ktx]
  return makeTrip({
    id: "seoul",
    name: "Seoul and Busan",
    destinations: ["Seoul", "Busan"],
    startDate: start,
    endDate: "2026-06-06",
    timezone: "Asia/Seoul",
    days,
    ...overrides,
  })
}
