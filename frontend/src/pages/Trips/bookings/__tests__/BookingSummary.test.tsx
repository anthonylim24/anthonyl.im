import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { ItineraryItem, TripDay } from "../../types"
import { BookingSummary, BookingSummaryLines } from "../BookingSummary"
import { TonightLine } from "../TonightLine"

const trip = makeTrip({ timezone: "America/Los_Angeles" })
const day: TripDay = { id: "day-1", date: "2026-12-20", items: [] }

function booking(reservation: ItineraryItem["reservation"], extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return { id: "b1", kind: "reservation", title: "Booking", status: "booked", createdBy: "user", reservation, ...extra }
}

const flight = booking(
  { type: "flight", status: "confirmed", provider: "Hawaiian Airlines", number: "HA 11", from: "SFO", to: "HNL", endDate: "2026-12-21", endTimezone: "Pacific/Honolulu" },
  { time: "22:10", endTime: "13:40" },
)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("BookingSummary", () => {
  it("reads a flight that lands the next day, in the zone it lands in", () => {
    const { container } = render(<BookingSummary item={flight} trip={trip} day={day} />)
    expect(container).toHaveTextContent("HA 11 · SFO → HNL · lands 13:40 HST (+1 day)")
    expect(container).toHaveTextContent("Hawaiian Airlines")
  })

  it("reads a stay's check-out, with the code to copy, a number to call and only a https link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const stay = booking(
      { type: "hotel", status: "confirmed", endDate: "2026-12-24", confirmation: "HK-77812", contact: "+1 808 923 2311", url: "http://halekulani.example/booking" },
      { title: "Halekulani", time: "15:00", endTime: "11:00" },
    )
    const { container } = render(<BookingSummary item={stay} trip={trip} day={day} />)
    expect(container).toHaveTextContent("4 nights · Check-out Thu 24 Dec, 11:00")
    expect(screen.getByRole("link", { name: "+1 808 923 2311" })).toHaveAttribute("href", "tel:+18089232311")
    // A plain-http link is not offered.
    expect(screen.queryByText("halekulani.example")).toBeNull()
    expect(screen.getAllByRole("link")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Copy confirmation HK-77812" }))
    expect(writeText).toHaveBeenCalledWith("HK-77812")
    expect(await screen.findByText("Copied")).toBeInTheDocument()
  })

  it("opens a https booking link in a new tab, away from this page's window", () => {
    render(<BookingSummary item={booking({ type: "meal", status: "confirmed", url: "https://www.opentable.com/r/123", contact: "ask for Ana" })} trip={trip} day={day} />)
    const link = screen.getByRole("link", { name: /opentable\.com/ })
    expect(link).toHaveAttribute("href", "https://www.opentable.com/r/123")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer noopener")
    // A contact that is neither a phone number nor an email stays text.
    expect(screen.getByText("ask for Ana").closest("a")).toBeNull()
  })

  it("says when a booking isn't confirmed yet, and nothing for a confirmed one with no details", () => {
    const { container, rerender } = render(<BookingSummaryLines item={booking({ type: "meal", status: "pending" })} trip={trip} day={day} />)
    expect(container).toHaveTextContent("Pending: not confirmed yet")
    rerender(<BookingSummaryLines item={booking({ type: "meal", status: "confirmed" })} trip={trip} day={day} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("TonightLine", () => {
  const stay = (endDate?: string): ItineraryItem =>
    booking({ type: "hotel", status: "confirmed", ...(endDate ? { endDate } : {}) }, { id: "stay", title: "Halekulani", endTime: "11:00" })
  const days = (first: ItineraryItem[]): TripDay[] => [
    { id: "d1", date: "2026-12-20", items: first },
    { id: "d2", date: "2026-12-21", items: [] },
    { id: "d3", date: "2026-12-22", items: [] },
    { id: "d4", date: "2026-12-23", items: [] },
    { id: "d5", date: "2026-12-24", items: [] },
  ]

  it("counts the nights of a stay with a check-out date", () => {
    const t = makeTrip({ days: days([stay("2026-12-24")]) })
    const { container, rerender } = render(<TonightLine trip={t} day={t.days[1]} />)
    expect(container).toHaveTextContent("Sleeping at Halekulani · night 2 of 4")
    rerender(<TonightLine trip={t} day={t.days[4]} />)
    expect(container).toHaveTextContent("Check out of Halekulani by 11:00")
  })

  it("leaves the count out of a single night, and says nothing on a day with no stay", () => {
    const one = makeTrip({ days: days([stay("2026-12-21")]) })
    const { container, rerender } = render(<TonightLine trip={one} day={one.days[0]} />)
    expect(container).toHaveTextContent("Sleeping at Halekulani")
    expect(container).not.toHaveTextContent("night 1")
    const none = makeTrip({ days: days([]) })
    rerender(<TonightLine trip={none} day={none.days[2]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("keeps a stay with no check-out until the next one, as before", () => {
    const t = makeTrip({ days: days([stay()]) })
    const { container } = render(<TonightLine trip={t} day={t.days[2]} />)
    expect(within(container).getByText("Halekulani")).toBeInTheDocument()
    expect(container).toHaveTextContent("night 3 of 4")
  })
})
