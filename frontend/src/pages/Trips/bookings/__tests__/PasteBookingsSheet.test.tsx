import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { ParsedBooking } from "../bookingsApi"
import { PasteBookingsSheet } from "../PasteBookingsSheet"

// Trip days: 2026-07-10 (day-1) and 2026-07-11 (day-2).
const trip = makeTrip()
const getToken = async () => "t"

const flight: ParsedBooking = {
  date: "2026-07-10",
  item: {
    kind: "reservation",
    title: "TAP to Porto",
    status: "booked",
    createdBy: "ai",
    time: "09:00",
    endTime: "10:00",
    reservation: { type: "flight", status: "confirmed", number: "TP 1940", from: "LIS", to: "OPO", confirmation: "QX7P2L" },
  },
}
const laterStay: ParsedBooking = {
  date: "2026-08-02",
  item: { kind: "reservation", title: "Hotel in Porto", status: "booked", createdBy: "ai", reservation: { type: "hotel", status: "confirmed" } },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function renderSheet() {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(<PasteBookingsSheet trip={trip} getToken={getToken} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

function paste(text = "Your TAP booking QX7P2L …") {
  fireEvent.change(screen.getByLabelText("Confirmation email or page"), { target: { value: text } })
  fireEvent.click(screen.getByRole("button", { name: "Find bookings" }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PasteBookingsSheet", () => {
  it("sends the paste to the trip's parse route and adds only the ticked bookings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ bookings: [flight, laterStay] }))
    const { onAdd, onClose } = renderSheet()
    paste()

    expect(await screen.findByText(/Found 2 bookings\./)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/trips/lisbon/bookings/parse")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ text: "Your TAP booking QX7P2L …" })
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer t")

    // The flight lands on its day, ticked; the stay is outside the trip, explained and left out.
    expect(screen.getByRole("checkbox", { name: "Add TAP to Porto" })).toBeChecked()
    const stay = screen.getByRole("checkbox", { name: "Add Hotel in Porto" })
    expect(stay).not.toBeChecked()
    expect(stay).toBeDisabled()
    expect(screen.getByText(/Sun 2 Aug is outside this trip/)).toHaveTextContent("Choose a day to add it to.")

    // Nothing is added until the traveller says so.
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Add 1 booking" }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    const [entries] = onAdd.mock.calls[0]
    expect(entries).toEqual([{ dayId: "day-1", item: expect.objectContaining({ title: "TAP to Porto", id: expect.stringMatching(/^it-/) }) }])
    expect(onClose).toHaveBeenCalled()
  })

  it("lets a booking outside the trip go on a chosen day, once it is ticked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ bookings: [flight, laterStay] }))
    const { onAdd } = renderSheet()
    paste()
    await screen.findByText(/Found 2 bookings\./)

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "day-2" } })
    const stay = screen.getByRole("checkbox", { name: "Add Hotel in Porto" })
    expect(stay).toBeEnabled()
    expect(stay).not.toBeChecked()
    fireEvent.click(stay)
    fireEvent.click(screen.getByRole("button", { name: "Add 2 bookings" }))
    expect(onAdd.mock.calls[0][0].map((entry: { dayId: string }) => entry.dayId)).toEqual(["day-1", "day-2"])
  })

  it("leaves a booking the trip already holds unticked", async () => {
    const withFlight = makeTrip({
      days: [
        { id: "day-1", date: "2026-07-10", items: [{ id: "old", kind: "reservation", title: "Flight to Porto", status: "booked", createdBy: "user", reservation: { type: "flight", status: "confirmed", confirmation: "qx7p2l" } }] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ bookings: [flight] }))
    render(<PasteBookingsSheet trip={withFlight} getToken={getToken} onAdd={vi.fn()} onClose={vi.fn()} />)
    paste()
    expect(await screen.findByRole("checkbox", { name: "Add TAP to Porto" })).not.toBeChecked()
    expect(screen.getByText(/Already on the trip/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add bookings" })).toBeDisabled()
  })

  it("shows the server's own words when reading isn't set up, and keeps the paste", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: "ai_not_configured", message: "Reading confirmations isn’t set up on this server. Add the booking by hand instead." }, 503),
    )
    const { onAdd } = renderSheet()
    paste("Booking ref ABC")
    expect(await screen.findByRole("alert")).toHaveTextContent("Reading confirmations isn’t set up on this server.")
    expect(screen.getByLabelText("Confirmation email or page")).toHaveValue("Booking ref ABC")
    expect(onAdd).not.toHaveBeenCalled()
  })

  it("says so when nothing was found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ bookings: [] }))
    renderSheet()
    paste("Hello")
    expect(await screen.findByText(/No bookings found in that text/)).toBeInTheDocument()
  })

  it("closes without adding anything on Cancel", () => {
    const { onAdd, onClose } = renderSheet()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
