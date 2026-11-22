import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { ChangesSheet } from "../ChangesSheet"
import type { AppliedChanges } from "../planDiff"

const tram = makeItem({ id: "it-tram", title: "Tram 28", time: "09:00", endTime: "10:00" })
const cafe = makeItem({ id: "it-cafe", title: "Café A Brasileira" })
const tiles = makeItem({ id: "it-tiles", title: "Tile museum", time: "15:00" })
const sintra = makeItem({ id: "it-sintra", title: "Sintra", time: "08:30", fromWishlist: true })

const before = makeTrip({
  days: [
    { id: "day-1", date: "2026-07-10", items: [tram, cafe, tiles] },
    { id: "day-2", date: "2026-07-11", items: [] },
  ],
})
const after = makeTrip({
  updatedAt: "2026-01-02T00:00:00Z",
  days: [
    { id: "day-1", date: "2026-07-10", items: [{ ...tram, time: "10:30", endTime: "11:30" }, cafe] },
    { id: "day-2", date: "2026-07-11", items: [sintra, { ...tiles, time: "16:00" }] },
  ],
})

const applied: AppliedChanges = {
  before,
  after,
  skipped: [{ id: "s-hotel", title: "Stay closer to the river", reason: "The hotel isn’t on the trip any more." }],
}

function renderSheet(reduce: boolean, onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ChangesSheet changes={applied} basePath="/trips/lisbon" reduce={reduce} onClose={onClose} />
    </MemoryRouter>,
  )
  return { sheet: screen.getByRole("dialog", { name: "What changed" }), onClose }
}

describe("ChangesSheet", () => {
  it("says each change in words, day by day, and starts reading at the title", async () => {
    const { sheet } = renderSheet(false)
    expect(within(sheet).getByText("1 added").parentElement).toHaveTextContent("1 added · 1 retimed · 1 moved")

    const first = within(sheet).getByRole("list", { name: "Changes on Day 1" })
    expect(within(first).getByText("9:00 AM → 10:30 AM")).toBeInTheDocument()
    expect(within(first).getByText("To Day 2")).toBeInTheDocument()

    const second = within(sheet).getByRole("list", { name: "Changes on Day 2" })
    expect(within(second).getByText("From your wishlist · 8:30 AM")).toBeInTheDocument()
    expect(within(second).getByText("From Day 1 · 4:00 PM")).toBeInTheDocument()
    // The glyph is hidden; the kind is said first.
    expect(within(second).getByText("Added:", { exact: false })).toBeInTheDocument()

    await waitFor(() => expect(within(sheet).getByRole("heading", { name: "What changed" })).toHaveFocus())
  })

  it("names what couldn’t be applied, with the reason, and where it went", () => {
    const { sheet } = renderSheet(false)
    expect(within(sheet).getByRole("heading", { name: "Couldn’t apply · 1" })).toBeInTheDocument()
    expect(within(sheet).getByText("Stay closer to the river")).toBeInTheDocument()
    expect(within(sheet).getByText("The hotel isn’t on the trip any more.")).toBeInTheDocument()
    expect(within(sheet).getByText(/It’s still in the review, so you can try it again or skip it\./)).toBeInTheDocument()
  })

  it("says when a day reads in time order again, naming the stop that moved up", () => {
    const outOfOrder = makeTrip({ days: [{ id: "day-1", date: "2026-07-10", items: [tiles, tram] }] })
    const inOrder = makeTrip({ updatedAt: "2026-01-02T00:00:00Z", days: [{ id: "day-1", date: "2026-07-10", items: [tram, tiles] }] })
    render(
      <MemoryRouter>
        <ChangesSheet changes={{ before: outOfOrder, after: inOrder, skipped: [] }} basePath="/trips/lisbon" reduce onClose={vi.fn()} />
      </MemoryRouter>,
    )
    const sheet = screen.getByRole("dialog", { name: "What changed" })
    expect(within(sheet).getByText("1 day back in time order")).toBeInTheDocument()
    const rows = within(sheet).getByRole("list", { name: "Changes on Day 1" })
    expect(within(rows).getByText("Back in time order")).toBeInTheDocument()
    expect(within(rows).getByText("Tram 28 9:00 AM now comes before Tile museum 3:00 PM")).toBeInTheDocument()
  })

  it("closes on Escape", () => {
    const { sheet, onClose } = renderSheet(false)
    fireEvent.keyDown(sheet, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("opens a day and closes the sheet", () => {
    const { sheet, onClose } = renderSheet(false)
    const link = within(sheet).getByRole("link", { name: "Open day 2" })
    expect(link).toHaveAttribute("href", "/trips/lisbon/day/day-2")
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalled()
  })

  it("replays the motion, and has nothing to replay under reduced motion", () => {
    const { sheet } = renderSheet(false)
    fireEvent.click(within(sheet).getByRole("button", { name: "Replay" }))
    expect(within(sheet).getByText("9:00 AM → 10:30 AM")).toBeInTheDocument()
  })

  it("shows the plan as it is now under reduced motion: no replay, the rows all there", () => {
    const { sheet } = renderSheet(true)
    expect(within(sheet).queryByRole("button", { name: "Replay" })).toBeNull()
    expect(within(sheet).getByRole("list", { name: "Changes on Day 2" }).children).toHaveLength(2)
    expect(within(sheet).getByRole("button", { name: "Done" })).toBeInTheDocument()
  })
})
