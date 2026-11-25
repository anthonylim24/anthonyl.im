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
import { pickOption } from "./pickOption"

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

/** Types into the time zone field and picks the option it lists. */
function searchZone(dialog: ReturnType<typeof within>, text: string, option: RegExp) {
  const zone = dialog.getByRole("combobox", { name: "Time zone" })
  fireEvent.focus(zone)
  fireEvent.change(zone, { target: { value: text } })
  fireEvent.click(within(dialog.getByRole("listbox", { name: "Time zones" })).getByRole("option", { name: option }))
  return zone
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

  it("lists the days that fall outside and saves their stops to the wishlist by default", () => {
    const { onApply, dialog } = renderDialog()
    pickDates(dialog, "Thursday, June 11, 2026", "Saturday, June 13, 2026")
    fireEvent.click(dialog.getByRole("radio", { name: /Keep plans on their dates/ }))

    const lost = dialog.getByRole("group", { name: "This day falls outside the new dates" })
    expect(within(lost).getByRole("listitem")).toHaveTextContent("Day 1 · Wed, Jun 10 · Arrival2 stops")
    expect(within(lost).getByRole("radio", { name: /Save their 2 stops to the wishlist/ })).toHaveAttribute("aria-checked", "true")

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
    expect(dialog.getByRole("combobox", { name: "Time zone" })).toHaveValue("Tokyo · Asia")
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

    expect(searchZone(dialog, "seo", /^Seoul/)).toHaveValue("Seoul · Asia")
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

  it("opens on the trip as it is when it opens, however many times it was drawn closed", () => {
    const props = { onClose: vi.fn(), onApply: vi.fn() }
    const view = render(<DetailsDialog trip={trip} open={false} {...props} />)
    expect(screen.queryByRole("combobox", { name: "Time zone" })).toBeNull()
    view.rerender(<DetailsDialog trip={{ ...trip, name: "Lisbon in June" }} open={false} {...props} />)
    view.rerender(<DetailsDialog trip={{ ...trip, name: "Lisbon and Sintra", timezone: "Europe/Madrid" }} open {...props} />)
    const dialog = within(screen.getByRole("dialog", { name: "Trip details" }))
    expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Lisbon and Sintra")
    const zone = dialog.getByRole("combobox", { name: "Time zone" })
    expect(zone).toHaveValue("Madrid · Europe")
    fireEvent.focus(zone)
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1)
  })

  it("keeps a zone the runtime doesn't know, and finds any other from a few letters", () => {
    const { onApply, dialog } = renderDialog({ ...trip, timezone: "Mars/Olympus_Mons" })
    const zone = dialog.getByRole("combobox", { name: "Time zone" })
    expect(zone).toHaveValue("Olympus Mons · Mars")
    fireEvent.focus(zone)
    expect(within(dialog.getByRole("listbox", { name: "Time zones" })).getAllByRole("option")[0]).toHaveTextContent("Olympus Mons Mars")

    searchZone(dialog, "lisb", /^Lisbon/)
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ timezone: "Europe/Lisbon" })
  })

  it("takes a typed city as the zone once the field is left", () => {
    const { onApply, dialog } = renderDialog()
    const zone = dialog.getByRole("combobox", { name: "Time zone" })
    fireEvent.focus(zone)
    fireEvent.change(zone, { target: { value: "new york" } })
    fireEvent.blur(zone)
    expect(zone).toHaveValue("New York · America")
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ timezone: "America/New_York" })
  })

  it("shuts the zone list on Escape and leaves the dialog open, then closes the dialog on the next", () => {
    const { onClose, dialog } = renderDialog()
    const zone = dialog.getByRole("combobox", { name: "Time zone" })
    fireEvent.focus(zone)
    fireEvent.change(zone, { target: { value: "seo" } })
    fireEvent.keyDown(zone, { key: "Escape" })
    expect(dialog.queryByRole("listbox", { name: "Time zones" })).toBeNull()
    expect(zone).toHaveValue("Lisbon · Europe")
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(zone, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("shuts the place suggestions on Escape and leaves the dialog open", async () => {
    mockSearchCities.mockResolvedValue([tokyo])
    const { onClose, dialog } = renderDialog()
    const where = dialog.getByRole("combobox", { name: "Where" })
    fireEvent.change(where, { target: { value: "Tok" } })
    await dialog.findByRole("option", { name: /Tokyo/ })

    fireEvent.keyDown(where, { key: "Escape" })
    expect(dialog.queryByRole("listbox", { name: "Matching places" })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("shuts the calendar on Escape and leaves the dialog open", () => {
    const { onClose, dialog } = renderDialog()
    const dates = dialog.getByRole("button", { name: /^Dates: / })
    fireEvent.click(dates)
    const day = within(screen.getByRole("dialog", { name: "Choose dates" })).getByRole("button", { name: "Thursday, June 11, 2026" })

    fireEvent.keyDown(day, { key: "Escape" })
    expect(dates).toHaveAttribute("aria-expanded", "false")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("opens the zone list again on a press after a pick, with the field still focused", () => {
    const { dialog } = renderDialog()
    const zone = searchZone(dialog, "seo", /^Seoul/)
    expect(dialog.queryByRole("listbox", { name: "Time zones" })).toBeNull()

    fireEvent.click(zone)
    expect(dialog.getByRole("listbox", { name: "Time zones" })).toBeInTheDocument()
    expect(zone).toHaveAttribute("aria-expanded", "true")
    expect([(zone as HTMLInputElement).selectionStart, (zone as HTMLInputElement).selectionEnd]).toEqual([0, "Seoul · Asia".length])
  })

  it("says the trip's length once, on the dates", () => {
    const { dialog } = renderDialog()
    expect(dialog.getAllByText(/^3 days\.?$/)).toHaveLength(1)
  })

  it("names the status in a word on the closed field and in full in its list", () => {
    const { onApply, dialog } = renderDialog()
    const status = dialog.getByRole("combobox", { name: "Status" })
    expect(status).toHaveTextContent(/^Confirmed$/)
    pickOption(status, "Draft · still planning")
    expect(status).toHaveTextContent(/^Draft$/)
    fireEvent.click(dialog.getByRole("button", { name: "Save details" }))
    expect(onApply).toHaveBeenCalledWith({ status: "draft" })
  })
})
