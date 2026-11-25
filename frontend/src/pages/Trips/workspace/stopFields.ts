import { bookingForm, reservationOf, type BookingForm, type Reservation } from "../bookings/kinds"
import type { ItineraryItem } from "../types"

/** The parts of a stop's editor under its name. */
export type StopField = "time" | "location" | "booking" | "details" | "notes" | "status" | "cost" | "links"

interface FieldSet {
  /** Shown for every stop of the kind. */
  always: readonly StopField[]
  /** Behind an "Add …" chip until they hold something or are asked for. */
  optional: readonly StopField[]
}

/**
 * What a stop's editor shows, by kind. A field that holds something always
 * shows; the rest wait behind a chip, so a new stop asks for a name, a time,
 * a place and a note, and nothing else until it is wanted.
 */
export const STOP_FIELDS: Record<"place" | "reservation" | "note", FieldSet> = {
  place: { always: ["time", "location", "notes"], optional: ["status", "cost", "links"] },
  // `booking` is its type, status and times; `details` the rest of it, field by field.
  reservation: { always: ["booking", "location", "notes"], optional: ["details", "cost", "links"] },
  note: { always: [], optional: ["time", "notes", "links"] },
}

/** The chip that asks for each optional field. */
export const FIELD_CHIP: Partial<Record<StopField, string>> = {
  time: "Add time",
  notes: "Add notes",
  status: "Add status",
  cost: "Add cost",
  links: "Add link",
  details: "More booking details",
}

/** The parts of a booking past its type, status and times, by form: each shows once it holds something. */
const BOOKING_DETAILS: Record<BookingForm, readonly (keyof Reservation)[]> = {
  flight: ["provider", "number", "from", "to", "terminal", "endTimezone", "seat", "confirmation", "contact", "url"],
  stay: ["provider", "confirmation", "contact", "url"],
  car: ["provider", "from", "to", "confirmation", "contact", "url"],
  ride: ["provider", "number", "from", "to", "seat", "confirmation", "contact", "url"],
  plain: ["confirmation", "contact", "url"],
}

export function isBookingDetail(form: BookingForm, key: keyof Reservation): boolean {
  return BOOKING_DETAILS[form].includes(key)
}

/** Whether a field holds something, so it shows without being asked for. */
export function holds(item: ItineraryItem, field: StopField): boolean {
  switch (field) {
    case "time":
      return !!item.time || !!item.endTime
    case "location":
      return !!item.location
    case "notes":
      return !!item.notes
    case "status":
      return item.status !== "none"
    case "cost":
      return !!item.cost
    case "links":
      return (item.links?.length ?? 0) > 0
    case "details": {
      const r = reservationOf(item)
      // Every detail filled: nothing is left to ask for.
      return BOOKING_DETAILS[bookingForm(r.type)].every((key) => !!r[key])
    }
    case "booking":
      return true
  }
}
