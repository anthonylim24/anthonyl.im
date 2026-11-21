import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { ItineraryItem, Trip } from "../../types"
import { TripRecap } from "../TripRecap"

const loadRates = vi.hoisted(() => vi.fn(async (): Promise<Record<string, number>> => ({})))
vi.mock("../../budget/rates", () => ({ loadRates }))

const shareRecapCard = vi.hoisted(() => vi.fn(async () => "saved" as const))
vi.mock("../shareCard", async (original) => ({ ...(await original<typeof import("../shareCard")>()), shareRecapCard }))

const at = (lat: number, lng: number, extra: Partial<ItineraryItem>): ItineraryItem =>
  makeItem({ location: { name: extra.title ?? "Place", source: "user", lat, lng }, ...extra })

function korea(): Trip {
  return makeTrip({
    name: "Winter in Korea",
    startDate: "2026-12-23",
    endDate: "2026-12-24",
    timezone: "Asia/Seoul",
    budget: { currency: "KRW" },
    days: [
      {
        id: "d1",
        date: "2026-12-23",
        city: "Seoul",
        journal: "Snow on the palace roofs.",
        items: [at(37.5796, 126.977, { id: "palace", title: "Gyeongbokgung", highlight: true }), at(37.5636, 126.9869, { id: "market", title: "Myeongdong" })],
      },
      {
        id: "d2",
        date: "2026-12-24",
        city: "Busan",
        items: [at(35.1587, 129.1604, { id: "beach", title: "Haeundae" })],
      },
    ],
    expenses: [
      { id: "e1", title: "Hotel", amount: 300_000, currency: "KRW", category: "lodging", createdAt: "2026-12-23T12:00:00Z" },
      { id: "e2", title: "Pho", amount: 10, currency: "VND", category: "food", createdAt: "2026-12-23T12:00:00Z" },
    ],
  })
}

const AFTER = new Date("2026-12-28T03:00:00Z")

beforeEach(() => {
  loadRates.mockClear()
  shareRecapCard.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("TripRecap", () => {
  it("looks back on the trip: figures, loved places, the journal and the spending", async () => {
    render(<TripRecap trip={korea()} open onClose={() => {}} now={AFTER} />)
    const sheet = within(await screen.findByRole("dialog", { name: "Winter in Korea" }))
    expect(sheet.getByText("Recap · Dec 23 – 24, 2026")).toBeInTheDocument()
    expect(sheet.getByText(/^2 days · 3 places · 2 cities · about \d{3} km$/)).toBeInTheDocument()
    expect(sheet.getByText("Seoul · Busan")).toBeInTheDocument()
    expect(within(sheet.getByRole("region", { name: "Loved" })).getByText("Gyeongbokgung")).toBeInTheDocument()
    expect(within(sheet.getByRole("region", { name: "From the journal" })).getByText("Snow on the palace roofs.")).toBeInTheDocument()
    const spent = within(sheet.getByRole("region", { name: "Spent" }))
    expect(spent.getByText("₩300,000", { selector: "p" })).toBeInTheDocument()
    expect(spent.getByText("Lodging")).toBeInTheDocument()
    expect(spent.getByText("Not counted: amounts in VND, with no rate to convert them.")).toBeInTheDocument()
    // Nothing to edit here, for any role.
    expect(sheet.queryAllByRole("textbox")).toHaveLength(0)
  })

  it("shares the recap as a picture and says what happened", async () => {
    render(<TripRecap trip={korea()} open onClose={() => {}} now={AFTER} />)
    fireEvent.click(await screen.findByRole("button", { name: "Share as a picture" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved the picture to your downloads."))
    expect(shareRecapCard).toHaveBeenCalledWith(expect.objectContaining({ name: "Winter in Korea", places: 3 }))
  })

  it("prints its own paper copy, named after the trip, and puts the title back after", async () => {
    const print = vi.fn()
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: print })
    document.title = "Trips"
    render(<TripRecap trip={korea()} open onClose={() => {}} now={AFTER} />)
    const paper = document.querySelector(".trips-recap-print-root")
    expect(paper).toHaveAttribute("aria-hidden", "true")
    expect(paper?.querySelector("h1")).toHaveTextContent("Winter in Korea")
    fireEvent.click(await screen.findByRole("button", { name: "Print" }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.title).toBe("Winter in Korea recap")
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("Trips")
  })

  it("says there is nothing yet before the trip, and draws nothing while closed", async () => {
    const { rerender } = render(<TripRecap trip={korea()} open={false} onClose={() => {}} now={new Date("2026-12-01T03:00:00Z")} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.querySelector(".trips-recap-print-root")).toBeNull()
    expect(loadRates).not.toHaveBeenCalled()
    const plan = {
      ...korea(),
      expenses: [],
      days: korea().days.map((day) => ({ ...day, journal: undefined, items: day.items.map((item) => ({ ...item, highlight: undefined })) })),
    }
    rerender(<TripRecap trip={plan} open onClose={() => {}} now={new Date("2026-12-01T03:00:00Z")} />)
    const sheet = within(await screen.findByRole("dialog", { name: "Winter in Korea" }))
    expect(sheet.getByText("Nothing to look back on yet. A place counts once its day is over, or when it is marked done.")).toBeInTheDocument()
    expect(sheet.getByText("0 of 2 days · 0 places")).toBeInTheDocument()
  })

  it("closes from its close button", async () => {
    const onClose = vi.fn()
    render(<TripRecap trip={korea()} open onClose={onClose} now={AFTER} />)
    fireEvent.click(await screen.findByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalled()
  })
})
