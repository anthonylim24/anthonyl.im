import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { ItineraryItem } from "../../types"
import { BookingFields } from "../../workspace/BookingFields"
import { pickOption } from "../../__tests__/pickOption"

const trip = makeTrip({ timezone: "America/Los_Angeles", startDate: "2026-12-20", endDate: "2026-12-23", days: [
  { id: "d1", date: "2026-12-20", items: [] },
  { id: "d2", date: "2026-12-21", items: [], timezone: "Pacific/Honolulu" },
  { id: "d3", date: "2026-12-22", items: [] },
  { id: "d4", date: "2026-12-23", items: [] },
] })

function booking(reservation: ItineraryItem["reservation"], extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return { id: "b1", kind: "reservation", title: "Booking", status: "booked", createdBy: "user", reservation, ...extra }
}

function renderFields(item: ItineraryItem, disabled = false) {
  const onChange = vi.fn()
  render(<BookingFields item={item} trip={trip} day={trip.days[0]} onChange={onChange} disabled={disabled} />)
  return onChange
}

describe("BookingFields", () => {
  it("asks a flight for its airline, number, airports, landing and seat", () => {
    renderFields(booking({ type: "flight", status: "confirmed" }))
    for (const label of ["Airline", "Flight number", "From", "To", "Departs", "Lands", "Lands on", "Terminal", "Arrival time zone", "Seat", "Confirmation", "Contact", "Booking link"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    // The trip's own zones are a tap away.
    expect(screen.getByRole("button", { name: /Honolulu/ })).toBeInTheDocument()
  })

  it("sends the whole reservation back with each change, empty fields left out", () => {
    const onChange = renderFields(booking({ type: "flight", status: "confirmed", seat: "14A" }))
    pickOption(screen.getByRole("combobox", { name: "Booking status" }), "Pending")
    expect(onChange).toHaveBeenLastCalledWith({ reservation: { type: "flight", status: "pending", seat: "14A" } })
    fireEvent.change(screen.getByLabelText("Seat"), { target: { value: "" } })
    expect(onChange).toHaveBeenLastCalledWith({ reservation: { type: "flight", status: "confirmed" } })
  })

  it("writes an airport code in capitals once the field is left", () => {
    const onChange = renderFields(booking({ type: "flight", status: "confirmed", from: "sfo" }))
    fireEvent.blur(screen.getByLabelText("From"))
    expect(onChange).toHaveBeenLastCalledWith({ reservation: { type: "flight", status: "confirmed", from: "SFO" } })
  })

  it("asks a stay for its check-in and check-out, counted in nights", () => {
    renderFields(booking({ type: "hotel", status: "confirmed" }))
    expect(screen.getByLabelText("Check-in")).toBeInTheDocument()
    expect(screen.getByLabelText("Check-out time")).toBeInTheDocument()
    const out = screen.getByRole("combobox", { name: "Check-out" })
    expect(out).toHaveTextContent("Not set")
    fireEvent.click(out)
    expect(screen.getByRole("option", { name: "Thu 24 Dec · 4 nights" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Seat")).toBeNull()
  })

  it("asks a car rental for its pick-up and drop-off", () => {
    renderFields(booking({ type: "car", status: "confirmed" }))
    for (const label of ["Company", "Pick-up place", "Pick-up", "Drop-off place", "Drop-off", "Drop-off day"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it("saves only a https link, and says why it refused one", () => {
    const onChange = renderFields(booking({ type: "meal", status: "confirmed" }))
    const link = screen.getByLabelText("Booking link")
    fireEvent.change(link, { target: { value: "javascript:alert(1)" } })
    fireEvent.blur(link)
    expect(screen.getByRole("alert")).toHaveTextContent("Only https:// links can be saved.")
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(link, { target: { value: "opentable.com/r/123" } })
    fireEvent.blur(link)
    expect(onChange).toHaveBeenLastCalledWith({ reservation: { type: "meal", status: "confirmed", url: "https://opentable.com/r/123" } })
  })

  it("can be shown read-only", () => {
    renderFields(booking({ type: "flight", status: "confirmed" }), true)
    expect(screen.getByLabelText("Flight number")).toBeDisabled()
    expect(screen.getByLabelText("Booking link")).toBeDisabled()
  })
})
