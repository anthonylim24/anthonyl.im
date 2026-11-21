import type { Trip } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

/**
 * A weekend with every kind of row the printout handles: a booked flight
 * with a confirmation, a heading, a timed place with a range and notes, an
 * untimed place, a note, an unpinned stop, a place parked under "To
 * schedule" (and a parked booking), and an empty day.
 */
export function printTrip(overrides: Partial<Trip> = {}): Trip {
  return makeTrip({
    name: "Lisbon Long Weekend",
    destinations: ["Lisbon"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Europe/Lisbon",
    description: "Tiles, tarts and the 28 tram.",
    appearance: { accent: "sky" },
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        title: "Arrival",
        notes: "Taxi rank is outside arrivals.",
        weather: { highC: 27.4, lowC: 18.6, condition: "Sunny" },
        items: [
          makeItem({
            id: "flight",
            kind: "reservation",
            title: "TP 238 · EWR → LIS",
            time: "10:40",
            status: "booked",
            reservation: { type: "flight", status: "confirmed", confirmation: "ABC123" },
            location: { name: "Lisbon Airport", address: "Alameda das Comunidades Portuguesas", lat: 38.7742, lng: -9.1342, source: "user" },
          }),
          makeItem({ id: "evening", kind: "section", title: "Evening" }),
          makeItem({
            id: "dinner",
            title: "Dinner at Ramiro",
            time: "19:30",
            endTime: "21:00",
            notes: "Order the garlic prawns.",
            location: { name: "Ramiro", address: "Av. Almirante Reis 1", category: "restaurant", lat: 38.7206, lng: -9.1356, source: "user" },
          }),
          makeItem({
            id: "view",
            title: "Miradouro da Graça",
            location: { name: "Miradouro da Graça", lat: 38.7163, lng: -9.1312, source: "user" },
          }),
          makeItem({ id: "note", kind: "note", title: "Buy a Viva Viagem card" }),
          makeItem({ id: "fado", title: "Find a fado bar" }),
          makeItem({ id: "park", kind: "section", title: "To schedule" }),
          makeItem({
            id: "market",
            title: "Time Out Market",
            location: { name: "Time Out Market", address: "Av. 24 de Julho 49", lat: 38.7069, lng: -9.1459, source: "ai" },
          }),
          makeItem({
            id: "tour",
            kind: "reservation",
            title: "Sintra day tour",
            reservation: { type: "experience", status: "tentative", confirmation: "SNT-77" },
          }),
        ],
      },
      { id: "day-2", date: "2026-07-11", items: [] },
      {
        id: "day-3",
        date: "2026-07-12",
        title: "Belém",
        items: [
          makeItem({
            id: "tarts",
            title: "Pastéis de Belém",
            time: "09:00",
            location: { name: "Pastéis de Belém", address: "R. de Belém 84", category: "cafe", lat: 38.6975, lng: -9.2032, source: "user" },
          }),
        ],
      },
    ],
    ...overrides,
  })
}
