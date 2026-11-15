// The reservation shape the Trips overview derives from itinerary items
// (pages/Trips/reservationView.ts).

export type ReservationStatus = "confirmed" | "tentative" | "pending"

export type ReservationType =
  | "flight"
  | "hotel"
  | "meal"
  | "bar"
  | "experience"
  | "transit"
  | "event"
  | "appointment"
  | "wedding"

export interface Reservation {
  id: string
  date: string
  time?: string
  type: ReservationType
  status: ReservationStatus
  title: string
  subtitle?: string
  address?: string
  contact?: string
  url?: string
  notes?: string
  dayNumber?: number
}
