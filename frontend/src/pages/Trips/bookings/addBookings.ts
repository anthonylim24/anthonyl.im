import { insertByTime } from "../conciergeProposal"
import { todayIsoIn } from "../meta"
import { makeItem } from "../tripEdits"
import type { ItineraryItem, Trip, TripDay } from "../types"
import type { ParsedBooking } from "./bookingsApi"

// Bookings on days: the trip's list of them in order, a new one by hand,
// and what a paste adds. Pure: the sheet and the dialog decide, the
// workspace commits each as one undoable change.

export interface BookingEntry {
  dayId: string
  item: ItineraryItem
}

/** Every booking on the trip in the order it happens: by day, then by start (untimed last on its day). */
export function bookingsInOrder(days: readonly TripDay[]): Array<{ day: TripDay; item: ItineraryItem }> {
  return days
    .flatMap((day) => day.items.filter((item) => item.kind === "reservation").map((item) => ({ day, item })))
    .sort((x, y) => x.day.date.localeCompare(y.day.date) || (x.item.time ?? "99:99").localeCompare(y.item.time ?? "99:99"))
}

/** The booking "Enter by hand" starts: its kind, untitled, so the day's editor opens ready to type. */
export function newBooking(type: string): ItineraryItem {
  return { ...makeItem("reservation"), status: "booked", reservation: { type, status: "confirmed" } }
}

/** The day a new booking starts on: today while the trip is on, else its first day. */
export function defaultBookingDay(trip: Pick<Trip, "days" | "timezone">): string | null {
  const today = todayIsoIn(trip.timezone)
  return (trip.days.find((day) => day.date === today) ?? trip.days[0])?.id ?? null
}

/** Each booking onto its day, where its time says it belongs. */
export function addBookings(days: readonly TripDay[], entries: readonly BookingEntry[]): TripDay[] {
  return days.map((day) => {
    const mine = entries.filter((entry) => entry.dayId === day.id)
    if (mine.length === 0) return day
    return { ...day, items: mine.reduce((items, entry) => insertByTime(items, entry.item), day.items) }
  })
}

/** A booking found in a paste, waiting for the traveller's tick. */
export interface BookingDraft {
  key: string
  item: ItineraryItem
  /** The date the confirmation gives. */
  date: string
  /** The trip day it goes on; null when the date is outside the trip and none was chosen. */
  dayId: string | null
  picked: boolean
  /** The day the trip already holds this booking on, if it does. */
  already: TripDay | null
}

const same = (x: string | undefined, y: string | undefined) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase()

/** The day this booking is already on: the same confirmation code, or the same title at the same time, on its date. */
export function alreadyOn(days: readonly TripDay[], date: string, item: Pick<ItineraryItem, "title" | "time" | "reservation">): TripDay | null {
  for (const day of days) {
    for (const existing of day.items) {
      if (existing.kind !== "reservation") continue
      const code = same(existing.reservation?.confirmation, item.reservation?.confirmation) && existing.reservation?.type === item.reservation?.type
      const slot = day.date === date && same(existing.title, item.title) && existing.time === item.time
      if ((code && day.date === date) || slot) return day
    }
  }
  return null
}

/**
 * The review list for what the server found: each booking with an id of its
 * own, on the day its date names, ticked unless its date is outside the
 * trip or the trip already has it.
 */
export function draftsFrom(found: readonly ParsedBooking[], trip: Pick<Trip, "days">): BookingDraft[] {
  return found.map((booking, i) => {
    const item: ItineraryItem = { ...booking.item, id: makeItem("reservation").id }
    const dayId = trip.days.find((day) => day.date === booking.date)?.id ?? null
    const already = alreadyOn(trip.days, booking.date, item)
    return { key: `${i}:${item.id}`, item, date: booking.date, dayId, picked: dayId !== null && !already, already }
  })
}

/** What the ticked drafts add, in the order they were found. */
export function pickedEntries(drafts: readonly BookingDraft[]): BookingEntry[] {
  return drafts.flatMap((draft) => (draft.picked && draft.dayId ? [{ dayId: draft.dayId, item: draft.item }] : []))
}
