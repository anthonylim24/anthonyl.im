import { useState } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { Modal } from "../components/kit"
import { dayShort } from "../conciergeProposal"
import { RESERVATION_TYPES } from "../meta"
import type { ItineraryItem, Trip } from "../types"
import { ws as s } from "../workspace.stylex"
import { defaultBookingDay, newBooking } from "./addBookings"
import { bookingTypeLabel } from "./kinds"

/**
 * "Enter by hand": what kind of booking and which day it starts on. The
 * workspace adds it there and opens it in the day's editor, where the
 * fields for that kind are waiting.
 */
export function AddBookingDialog({
  trip,
  onClose,
  onAdd,
}: {
  trip: Trip
  onClose: () => void
  onAdd: (dayId: string, item: ItineraryItem) => void
}) {
  const [type, setType] = useState<string>("flight")
  const [dayId, setDayId] = useState(() => defaultBookingDay(trip) ?? "")
  return (
    <Modal
      open
      onClose={onClose}
      accent={trip.appearance?.accent}
      title="Add a booking"
      description="Choose what it is and the day it starts. The rest is filled in on that day."
      footer={
        <>
          <button type="button" {...sx(a.btn, a.btnGhost)} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            {...sx(a.btn, a.btnPrimary)}
            disabled={!dayId}
            onClick={() => {
              onAdd(dayId, newBooking(type))
              onClose()
            }}
          >
            Add and open
          </button>
        </>
      }
    >
      <label>
        <span {...sx(s.miniLabel)}>What it is</span>
        <select value={type} {...sx(a.field)} onChange={(event) => setType(event.target.value)}>
          {RESERVATION_TYPES.map((value) => (
            <option key={value} value={value}>
              {bookingTypeLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span {...sx(s.miniLabel)}>Starts on</span>
        <select value={dayId} {...sx(a.field)} onChange={(event) => setDayId(event.target.value)}>
          {trip.days.map((day, i) => (
            <option key={day.id} value={day.id}>
              Day {i + 1} · {dayShort(day)}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  )
}
