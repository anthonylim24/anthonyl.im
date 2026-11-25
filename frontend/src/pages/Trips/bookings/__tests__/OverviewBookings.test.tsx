import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { ItineraryItem, Trip } from "../../types"
import { OverviewPanel } from "../../workspace/OverviewPanel"
import { pickOption } from "../../__tests__/pickOption"
import { STOP_STATUS_OF } from "../status"

// The stop's status paired with the booking's, as the editor and an import leave them.
const booking = (id: string, title: string, time: string | undefined, reservation: ItineraryItem["reservation"]): ItineraryItem =>
  makeItem({ id, kind: "reservation", title, status: STOP_STATUS_OF[reservation?.status ?? "confirmed"], time, reservation })

const trip = makeTrip({
  days: [
    {
      id: "day-1",
      date: "2026-07-10",
      items: [
        booking("dinner", "Dinner at Prado", "20:00", { type: "meal", status: "confirmed" }),
        booking("flight", "Flight to Lisbon", "07:15", { type: "flight", status: "confirmed", number: "TP 202", from: "BOS", to: "LIS" }),
      ],
    },
    { id: "day-2", date: "2026-07-11", items: [booking("train", "Train to Porto", "09:00", { type: "train", status: "pending" })] },
  ],
})

function renderPanel({ editable = true, withAdd = true, t = trip }: { editable?: boolean; withAdd?: boolean; t?: Trip } = {}) {
  const noop = vi.fn()
  const onAddBooking = vi.fn()
  const onPasteBookings = vi.fn()
  render(
    <MemoryRouter>
      <OverviewPanel
        trip={t}
        forecast={new Map()}
        basePath="/trips/lisbon"
        editable={editable}
        locked={false}
        drafting={false}
        enhancing={false}
        applying={false}
        run={null}
        dayOptions={[]}
        onDraft={noop}
        onHoverDay={noop}
        onApplyRun={noop}
        onDismissRun={noop}
        onStopAi={noop}
        {...(withAdd ? { onAddBooking, onPasteBookings } : {})}
      />
    </MemoryRouter>,
  )
  return { onAddBooking, onPasteBookings }
}

const bookingsSection = () => screen.getByRole("region", { name: "Bookings" })

describe("OverviewPanel bookings", () => {
  it("lists bookings in the order they happen, with their read lines", () => {
    renderPanel()
    const links = within(bookingsSection()).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/trips/lisbon/day/day-1#item-flight",
      "/trips/lisbon/day/day-1#item-dinner",
      "/trips/lisbon/day/day-2#item-train",
    ])
    expect(links[0]).toHaveTextContent("TP 202 · BOS → LIS")
    // Its chip says Pending; the lines do not say it again.
    expect(links[2]).toHaveTextContent("Pending")
    expect(links[2]).not.toHaveTextContent(/not confirmed/i)
  })

  it("gives a pasted booking the booking's own status, though the stop says booked", () => {
    const pasted = makeItem({ id: "pasted", kind: "reservation", title: "Ferry", status: "booked", time: "10:00", reservation: { type: "ferry", status: "pending" } })
    renderPanel({ t: makeTrip({ ...trip, days: [{ id: "day-1", date: "2026-07-10", items: [pasted] }] }) })
    const [link] = within(bookingsSection()).getAllByRole("link")
    expect(link).toHaveTextContent("Pending")
    expect(link).not.toHaveTextContent("Booked")
  })

  it("offers to paste a confirmation or enter a booking by hand", () => {
    const { onAddBooking, onPasteBookings } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Add booking" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste a confirmation" }))
    expect(onPasteBookings).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Add booking" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Enter by hand" }))
    const dialog = screen.getByRole("dialog", { name: "Add a booking" })
    pickOption(within(dialog).getByRole("combobox", { name: "What it is" }), "Car rental")
    pickOption(within(dialog).getByRole("combobox", { name: "Starts on" }), /^Day 2 · /)
    fireEvent.click(within(dialog).getByRole("button", { name: "Add and open" }))
    expect(onAddBooking).toHaveBeenCalledWith("day-2", expect.objectContaining({ kind: "reservation", reservation: { type: "car", status: "confirmed" } }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("shows a viewer the list and nothing to add with", () => {
    renderPanel({ editable: false })
    expect(within(bookingsSection()).getAllByRole("link")).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "Add booking" })).toBeNull()
  })

  it("keeps an empty bookings section for an editor only", () => {
    const empty = makeTrip()
    renderPanel({ t: empty })
    expect(within(bookingsSection()).getByText(/go here, in date order/)).toBeInTheDocument()
  })

  it("has no empty bookings section for a viewer", () => {
    renderPanel({ t: makeTrip(), editable: false })
    expect(screen.queryByRole("region", { name: "Bookings" })).toBeNull()
  })
})
