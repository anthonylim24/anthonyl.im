import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { CityResult } from "../geocode"
import type { Trip } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

const mockSearchCities = vi.fn()
vi.mock("../geocode", () => ({
  searchCities: (...args: unknown[]) => mockSearchCities(...args),
}))

import { DetailsDialog } from "../workspace/DetailsDialog"
import type { DetailsPatch } from "../workspace/tripDetails"

const tokyo: CityResult = { id: "1850147", name: "Tokyo", country: "Japan", lat: 35.6895, lng: 139.69171, timezone: "Asia/Tokyo" }

// Jun 10 – 12 in Lisbon; day 1 has two stops, day 3 one.
const trip: Trip = makeTrip({
  startDate: "2026-06-10",
  endDate: "2026-06-12",
  timezone: "Europe/Lisbon",
  destinations: ["Lisbon"],
  days: [
    { id: "day-1", date: "2026-06-10", title: "Arrival", items: [makeItem({ id: "a" }), makeItem({ id: "b" })] },
    { id: "day-2", date: "2026-06-11", items: [] },
    { id: "day-3", date: "2026-06-12", items: [makeItem({ id: "c" })] },
  ],
})

function renderDialog(current: Trip = trip) {
  const onApply = vi.fn<(patch: DetailsPatch) => void>()
  const onClose = vi.fn()
  render(<DetailsDialog trip={current} open onClose={onClose} onApply={onApply} />)
  return { onApply, onClose, dialog: within(screen.getByRole("dialog", { name: "Trip details" })) }
}

function pickDates(dialog: ReturnType<typeof within>, from: string, to: string) {
  fireEvent.click(dialog.getByRole("button", { name: /^Dates: / }))
  const calendar = within(screen.getByRole("dialog", { name: "Choose dates" }))
  fireEvent.click(calendar.getByRole("button", { name: from }))
  fireEvent.click(calendar.getByRole("button", { name: to }))
}

describe("DetailsDialog", () => {
  beforeEach(() => {
    mockSearchCities.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sends only the fields that changed", () => {
    const { onApply, dialog } = renderDialog()
    fireEvent.change(dialog.getByRole("textbox", { name: "Name" }), { target: { value: "  Lisbon in June " } })
    fireEvent.click(dialog.getByRole("radio", { name: "Cobalt" }))
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ name: "Lisbon in June", accent: "sky" })
  })

  it("asks what happens to the plans when the start moves, and saves nothing until answered", () => {
    const { onApply, dialog } = renderDialog()
    pickDates(dialog, "Thursday, June 11, 2026", "Saturday, June 13, 2026")

    const plans = dialog.getByRole("radiogroup", { name: "What happens to your plans" })
    expect(within(plans).getAllByRole("radio").map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false"])
    const save = dialog.getByRole("button", { name: "Save details" })
    expect(save).toBeDisabled()

    fireEvent.click(within(plans).getByRole("radio", { name: /Move my plans with the dates/ }))
    expect(save).toBeEnabled()
    // Shifting a 3-day trip into another 3 days loses nothing.
    expect(dialog.queryByRole("group", { name: /outside the new dates/ })).toBeNull()
    fireEvent.click(save)
    expect(onApply).toHaveBeenCalledWith({ dates: { startDate: "2026-06-11", endDate: "2026-06-13", plan: "shift", outside: "ideas" } })
  })

  it("lists the days that fall outside and saves their stops to Ideas by default", () => {
    const { onApply, dialog } = renderDialog()
    pickDates(dialog, "Thursday, June 11, 2026", "Saturday, June 13, 2026")
    fireEvent.click(dialog.getByRole("radio", { name: /Keep plans on their dates/ }))

    const lost = dialog.getByRole("group", { name: "This day falls outside the new dates" })
    expect(within(lost).getByRole("listitem")).toHaveTextContent("Day 1 · Wed, Jun 10 · Arrival2 stops")
    expect(within(lost).getByRole("radio", { name: /Save their 2 stops to Ideas/ })).toHaveAttribute("aria-checked", "true")

    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ dates: { startDate: "2026-06-11", endDate: "2026-06-13", plan: "keep", outside: "ideas" } })
  })

  it("names what it removes on the button when the traveller chooses to drop the stops", () => {
    const { onApply, dialog } = renderDialog()
    pickDates(dialog, "Wednesday, June 10, 2026", "Thursday, June 11, 2026")

    // Only the end moved: no question, but the last day's stop still needs a decision.
    expect(dialog.queryByRole("radiogroup", { name: "What happens to your plans" })).toBeNull()
    fireEvent.click(dialog.getByRole("radio", { name: /Remove it/ }))
    fireEvent.click(dialog.getByRole("button", { name: "Remove 1 stop and save" }))
    expect(onApply).toHaveBeenCalledWith({ dates: { startDate: "2026-06-10", endDate: "2026-06-11", plan: "keep", outside: "delete" } })
  })

  it("moves the map centre and time zone to a new first destination, and says so", async () => {
    mockSearchCities.mockResolvedValue([tokyo])
    const { onApply, dialog } = renderDialog()
    fireEvent.click(dialog.getByRole("button", { name: "Remove Lisbon" }))
    const where = dialog.getByRole("combobox", { name: "Where" })
    fireEvent.change(where, { target: { value: "Tok" } })
    const matches = await dialog.findByRole("listbox", { name: "Matching places" })
    fireEvent.click(await within(matches).findByRole("option", { name: /Tokyo/ }))

    expect(dialog.getByRole("status")).toHaveTextContent("Times now follow Tokyo time.")
    expect(dialog.getByRole("combobox", { name: "Time zone" })).toHaveValue("Asia/Tokyo")
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({
      destinations: ["Tokyo"],
      center: { lat: 35.6895, lng: 139.69171 },
      timezone: "Asia/Tokyo",
    })
  })

  it("looks up a first destination that was typed, and keeps a zone picked by hand", async () => {
    mockSearchCities.mockImplementation(async (query: string) => (query === "Tokyo" ? [tokyo] : []))
    const { onApply, dialog } = renderDialog(makeTrip({ ...trip, destinations: ["Lisbon", "Tokyo"] }))
    fireEvent.click(dialog.getByRole("button", { name: "Remove Lisbon" }))
    await waitFor(() => expect(dialog.getByRole("status")).toHaveTextContent("Times now follow Tokyo time."))

    fireEvent.change(dialog.getByRole("combobox", { name: "Time zone" }), { target: { value: "Asia/Seoul" } })
    expect(dialog.getByRole("status")).toHaveTextContent("")
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ destinations: ["Tokyo"], center: { lat: 35.6895, lng: 139.69171 }, timezone: "Asia/Seoul" })
  })

  it("leaves the centre and zone alone when the new first place can't be found", async () => {
    const { onApply, dialog } = renderDialog(makeTrip({ ...trip, destinations: ["Lisbon", "Middle of nowhere"] }))
    fireEvent.click(dialog.getByRole("button", { name: "Remove Lisbon" }))
    await waitFor(() =>
      expect(dialog.getByRole("status")).toHaveTextContent(
        "Couldn’t place “Middle of nowhere” on the map, so the map centre and time zone stay as they were.",
      ),
    )
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ destinations: ["Middle of nowhere"] })
  })

  it("closes without an edit when nothing changed", () => {
    const { onApply, onClose, dialog } = renderDialog()
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("still hands older callers a whole trip, built from the current one", () => {
    const onSave = vi.fn<(next: Trip) => void>()
    render(<DetailsDialog trip={trip} open onClose={() => {}} onSave={onSave} />)
    const dialog = within(screen.getByRole("dialog", { name: "Trip details" }))
    fireEvent.change(dialog.getByRole("textbox", { name: "Name" }), { target: { value: "June" } })
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: "June", days: trip.days })
  })
})
