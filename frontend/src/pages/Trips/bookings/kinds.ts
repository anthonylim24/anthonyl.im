import { RESERVATION_TYPES, titleCase } from "../meta"
import { isLodgingType } from "../lodging"
import type { ItineraryItem } from "../types"

// What kind of booking an item is decides which fields it has: a flight has
// a flight number and a landing, a stay a check-out, a car a drop-off.
// `reservation.type` stays free text in the document (older trips say
// "Hotel check-in", "wedding"), so every type maps onto one of five forms.

export type BookingForm = "flight" | "stay" | "car" | "ride" | "plain"

export type Reservation = NonNullable<ItineraryItem["reservation"]>
export type ReservationStatus = Reservation["status"]

const LABEL: Record<string, string> = {
  flight: "Flight",
  hotel: "Stay",
  car: "Car rental",
  train: "Train",
  bus: "Bus",
  ferry: "Ferry",
  transit: "Transit",
  meal: "Restaurant",
  bar: "Bar",
  experience: "Tour or activity",
  event: "Event",
  appointment: "Appointment",
}

/** "Car rental", "Stay": the name a person uses, not the stored id. */
export function bookingTypeLabel(type: string | undefined): string {
  const key = type?.trim().toLowerCase() ?? ""
  return LABEL[key] ?? (key ? titleCase(type!.trim()) : "Booking")
}

export function bookingForm(type: string | undefined): BookingForm {
  const t = type?.trim().toLowerCase() ?? ""
  if (/flight|plane|airline/.test(t)) return "flight"
  // Before lodging: "car rental" would otherwise read as a holiday rental.
  if (/\bcar\b|car[- ]?(hire|rental)/.test(t)) return "car"
  if (/train|rail|\bbus\b|coach|ferry|boat|transit/.test(t)) return "ride"
  if (isLodgingType(t)) return "stay"
  return "plain"
}

/** The types a booking can be set to, keeping one the list doesn't know so a select never drops it. */
export function bookingTypeOptions(current: string | undefined): string[] {
  const known: readonly string[] = RESERVATION_TYPES
  return current && !known.includes(current) ? [current, ...known] : [...known]
}

export const RESERVATION_STATUSES: readonly ReservationStatus[] = ["confirmed", "tentative", "pending"]

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed: "Confirmed",
  tentative: "Tentative",
  pending: "Pending",
}

/** An item's reservation, or the one a booking without details starts from. */
export function reservationOf(item: Pick<ItineraryItem, "reservation">): Reservation {
  return item.reservation ?? { type: "experience", status: "confirmed" }
}

/** Words for the person and the number field, by form: "Airline" / "Flight number", "Operator" / "Train number". */
export function partyWords(type: string | undefined): { provider: string; number: string } {
  const form = bookingForm(type)
  if (form === "flight") return { provider: "Airline", number: "Flight number" }
  if (form === "car") return { provider: "Company", number: "Booking number" }
  if (form === "stay") return { provider: "Booked with", number: "Booking number" }
  if (form === "ride") {
    const t = type?.trim().toLowerCase() ?? ""
    const noun = /ferry|boat/.test(t) ? "Ferry" : /\bbus\b|coach/.test(t) ? "Bus" : "Train"
    return { provider: "Operator", number: `${noun} number` }
  }
  return { provider: "Booked with", number: "Booking number" }
}
