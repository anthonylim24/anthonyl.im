// Types mirror server/src/data/koreaSnapshot.ts. Kept manually in sync.

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

export interface DaySection {
  heading: string
  time?: string
  bullets: string[]
}

export interface Day {
  n: number
  slug: string
  date: string
  dayOfWeek: string
  emoji: string
  title: string
  city: "Seoul" | "Busan" | "Yangju" | "Incheon"
  neighborhoods: string[]
  theme: string
  hotel: string
  weather?: { highC: number; lowC: number; condition: string }
  reservations: Reservation[]
  sections: DaySection[]
  callouts?: { icon: string; tone: "info" | "warn" | "success" | "alert"; body: string }[]
}

export interface Snapshot {
  generatedAt: string
  trip: {
    title: string
    startDate: string
    endDate: string
    flights: { out: string; back: string; confirmation: string }
    hotels: { name: string; nights: string }[]
    anchor: string
    holidays: string[]
  }
  status: {
    tMinus: number
    asOf: string
    headline: string
    weather: string[]
    bookActions: { id: string; label: string }[]
    adds: string[]
  }
  reservations: Reservation[]
  days: Day[]
  neighborhoods: { name: string; days: string; picks: string }[]
}

export interface DayDetailResponse {
  day: Day
  reservations: Reservation[]
}
