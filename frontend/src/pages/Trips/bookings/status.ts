import { STATUS_LABEL } from "../meta"
import type { ItemStatus, ItineraryItem } from "../types"
import { reservationOf, type ReservationStatus } from "./kinds"

// A booking carries two statuses: the stop's (`item.status`: on the plan, and
// how it went) and the booking's own (`reservation.status`, which the
// overview, the calendar file and print read). Its editor and card show one.
// Until the stop is Done or Skipped that one is the booking's, and changing
// it moves both, paired the way an imported booking is
// (server/src/trips/koreaTrip.ts). Done and Skipped are the stop's alone.

export type BookingStatus = ReservationStatus | "completed" | "skipped"

export const STOP_STATUS_OF: Record<ReservationStatus, ItemStatus> = { confirmed: "booked", tentative: "optional", pending: "needs_review" }

export const BOOKING_STATUSES: readonly BookingStatus[] = ["confirmed", "tentative", "pending", "completed", "skipped"]

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Booked",
  tentative: "Tentative",
  pending: "Pending",
  completed: "Done",
  skipped: "Skipped",
}

export function bookingStatus(item: Pick<ItineraryItem, "status" | "reservation">): BookingStatus {
  return item.status === "completed" || item.status === "skipped" ? item.status : reservationOf(item).status
}

export function bookingStatusPatch(item: Pick<ItineraryItem, "reservation">, status: BookingStatus): Partial<Pick<ItineraryItem, "status" | "reservation">> {
  if (status === "completed" || status === "skipped") return { status }
  return { status: STOP_STATUS_OF[status], reservation: { ...reservationOf(item), status } }
}

export function shownStatus(item: Pick<ItineraryItem, "kind" | "status" | "reservation">): { status: ItemStatus | BookingStatus; label: string } {
  if (item.kind !== "reservation") return { status: item.status, label: STATUS_LABEL[item.status] }
  const status = bookingStatus(item)
  return { status, label: BOOKING_STATUS_LABEL[status] }
}
