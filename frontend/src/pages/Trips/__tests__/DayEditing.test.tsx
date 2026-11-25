import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

const mockSearch = vi.fn(async () => [])
vi.mock("../geocode", () => ({ searchPlaces: (...args: unknown[]) => mockSearch(...(args as [])) }))

import type { UndoMark } from "../editorMachine"
import { LIMITS } from "../limits"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { AddStop } from "../workspace/AddStop"
import { DayPanel } from "../workspace/DayPanel"
import type { EditorSurface } from "../workspace/stopEdits"
import { DayRail } from "../workspace/DayRail"
import { liveValue } from "../workspace/liveValue"
import { makeItem, makeTrip } from "./tripFixtures"
import { pickOption } from "./pickOption"

afterEach(() => vi.clearAllMocks())

// 2026-07 has passed (the stops can be marked); 2099 has not.
const PAST = ["2026-07-10", "2026-07-11", "2026-07-12"]
const FUTURE = ["2099-07-10", "2099-07-11"]

const lunch = makeItem({ id: "lunch", title: "Lunch", time: "12:30" })
const tram = makeItem({ id: "tram", title: "Tram 28", time: "15:00" })
const heading = makeItem({ id: "park", kind: "section", title: "To schedule" })
const reel = makeItem({ id: "reel", title: "From a reel" })

const days = (dates: string[], items: ItineraryItem[][] = []): TripDay[] =>
  dates.map((date, i) => ({ id: `day-${i + 1}`, date, items: items[i] ?? [] }))

const tripOf = (list: TripDay[], more: Partial<Trip> = {}) =>
  makeTrip({ days: list, startDate: list[0]!.date, endDate: list[list.length - 1]!.date, ...more })

interface Options {
  editable?: boolean
  locked?: boolean
  /** Hand the panel `onEditTrip` (day operations, Save for later). */
  wholeTrip?: boolean
  /** Where a stop's editor opens: under its card (a wide list) or in a sheet. */
  surface?: EditorSurface
}

/** One day of a live trip: every edit lands, and the marks and the URL are kept. */
function renderDay(trip: Trip, dayId: string, { editable = true, locked = false, wholeTrip = true, surface = "inline" }: Options = {}) {
  const state: { trip: Trip; marks: (UndoMark | undefined)[]; path: string } = { trip, marks: [], path: "" }
  function Probe() {
    state.path = useLocation().pathname
    return null
  }
  function Harness() {
    const [doc, setDoc] = useState(trip)
    const commit = (next: Trip, mark: UndoMark | undefined) => {
      state.trip = next
      state.marks.push(mark)
      setDoc(next)
    }
    const index = Math.max(0, doc.days.findIndex((d) => d.id === dayId))
    const day = doc.days[index]!
    const noop = () => {}
    return (
      <DayPanel
        trip={doc}
        day={day}
        dayIndex={index}
        basePath="/trips/lisbon"
        editable={editable}
        locked={locked}
        enhancing={false}
        applying={false}
        run={null}
        dayOptions={doc.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1} · ${d.date}` }))}
        recentIds={new Set()}
        hot={liveValue<string | null>(null)}
        activeId={null}
        edit={null}
        dayView="list"
        onDayView={noop}
        surface={surface}
        near={null}
        onChange={(fn, mark) => commit({ ...state.trip, days: fn(state.trip.days) }, mark)}
        onEditTrip={wholeTrip ? (fn, mark) => commit(fn(state.trip), mark) : undefined}
        onDelete={noop}
        onAdded={noop}
        onLocate={noop}
        onAskAi={noop}
        onClear={noop}
        onApplyRun={noop}
        onDismissRun={noop}
        onStopAi={noop}
        sky={{ status: "none" }}
      />
    )
  }
  render(
    <MemoryRouter initialEntries={[`/trips/lisbon/day/${dayId}`]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Harness />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return state
}

const itemsOf = (state: { trip: Trip }, dayId: string) => state.trip.days.find((d) => d.id === dayId)!.items
const card = (id: string) => document.getElementById(`item-${id}`)!
const openDayMenu = (n = 1) => fireEvent.click(screen.getByRole("button", { name: `More for day ${n}` }))
const menuItem = (name: string) => within(screen.getByRole("menu")).getByRole("menuitem", { name })

describe("Done, Skip and Loved it on the card", () => {
  it("marks a past day's stop from the card, and each press toggles", () => {
    const state = renderDay(tripOf(days(PAST, [[lunch]])), "day-1")
    const how = within(screen.getByRole("group", { name: "How Lunch went" }))
    const done = how.getByRole("button", { name: "Done" })
    const skip = how.getByRole("button", { name: "Skip" })
    expect(done).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(done)
    expect(itemsOf(state, "day-1")[0]!.status).toBe("completed")
    expect(done).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(skip)
    expect(itemsOf(state, "day-1")[0]!.status).toBe("skipped")
    expect(skip).toHaveAttribute("aria-pressed", "true")
    expect(done).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(skip)
    expect(itemsOf(state, "day-1")[0]!.status).toBe("none")
  })

  it("puts a booking back to booked when Done is pressed again", () => {
    const dinner = makeItem({ id: "dinner", kind: "reservation", title: "Dinner", status: "booked", reservation: { type: "restaurant", status: "confirmed" } })
    const state = renderDay(tripOf(days(PAST, [[dinner]])), "day-1")
    const done = within(screen.getByRole("group", { name: "How Dinner went" })).getByRole("button", { name: "Done" })
    fireEvent.click(done)
    expect(itemsOf(state, "day-1")[0]!.status).toBe("completed")
    fireEvent.click(done)
    expect(itemsOf(state, "day-1")[0]!.status).toBe("booked")
  })

  it("Loved it marks the stop and lists it above the day's journal", () => {
    const state = renderDay(tripOf(days(PAST, [[lunch, tram]])), "day-1")
    const loved = within(screen.getByRole("group", { name: "How Tram 28 went" })).getByRole("button", { name: "Loved it" })
    fireEvent.click(loved)
    expect(itemsOf(state, "day-1")[1]!.highlight).toBe(true)
    expect(loved).toHaveAttribute("aria-pressed", "true")
    expect(within(screen.getByRole("list", { name: "Loved it" })).getByText("Tram 28")).toBeInTheDocument()
    fireEvent.click(loved)
    expect(itemsOf(state, "day-1")[1]!.highlight).toBeUndefined()
  })

  it("is not offered before the day, to a viewer, or on notes", () => {
    const note = makeItem({ id: "note", kind: "note", title: "Bring cash" })
    renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    expect(screen.queryByRole("group", { name: "How Lunch went" })).toBeNull()
    document.body.innerHTML = ""
    renderDay(tripOf(days(PAST, [[lunch]])), "day-1", { editable: false })
    expect(screen.queryByRole("group", { name: "How Lunch went" })).toBeNull()
    document.body.innerHTML = ""
    renderDay(tripOf(days(PAST, [[note]])), "day-1")
    expect(screen.queryByRole("group", { name: /went/ })).toBeNull()
  })

  it("is held, not hidden, while the trip is locked", () => {
    renderDay(tripOf(days(PAST, [[lunch]])), "day-1", { locked: true })
    for (const button of within(screen.getByRole("group", { name: "How Lunch went" })).getAllByRole("button")) {
      expect(button).toBeDisabled()
    }
  })

  it("offers Skipped among the statuses in the editor", () => {
    renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^(?!More for).*Lunch/ }))
    fireEvent.click(within(card("lunch")).getByRole("button", { name: "Add status" }))
    fireEvent.click(within(card("lunch")).getByRole("combobox", { name: "Status" }))
    expect(screen.getByRole("option", { name: "Skipped" })).toBeInTheDocument()
  })
})

describe("a stop's editor in a sheet (the timeline, a phone)", () => {
  const row = (id: string) => card(id).querySelector<HTMLElement>("[data-card-row]")!

  it("opens from the card, titled with the stop and ready to type; Done hands focus back", async () => {
    renderDay(tripOf(days(FUTURE, [[lunch, tram]])), "day-1", { surface: "sheet" })
    expect(row("lunch")).toHaveAttribute("aria-haspopup", "dialog")
    expect(row("lunch")).not.toHaveAttribute("aria-expanded")
    row("lunch").focus()
    fireEvent.click(row("lunch"))

    const sheet = within(screen.getByRole("dialog", { name: "Lunch" }))
    expect(sheet.getByRole("textbox", { name: "Name" })).toHaveFocus()
    expect(card("lunch").querySelector("input")).toBeNull()
    fireEvent.click(sheet.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(row("lunch")).toHaveFocus()
  })

  it("moves the stop from its foot and says so inside the sheet", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, tram]])), "day-1", { surface: "sheet" })
    fireEvent.click(row("lunch"))
    const sheet = within(screen.getByRole("dialog", { name: "Lunch" }))
    expect(sheet.getByRole("button", { name: "Move up" })).toBeDisabled()
    fireEvent.click(sheet.getByRole("button", { name: "Move down" }))
    expect(itemsOf(state, "day-1").map((i) => i.id)).toEqual(["tram", "lunch"])
    expect(sheet.getByRole("status")).toHaveTextContent("Lunch moved down, now 2 of 2.")
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Moved “Lunch”", key: "move:lunch" })
  })

  it("sends the stop to another day, then hands focus to the stop after it", async () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, tram], []])), "day-1", { surface: "sheet" })
    fireEvent.click(row("lunch"))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Lunch" })).getByRole("button", { name: "Move to another day…" }))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Move “Lunch”" })).getByRole("button", { name: /Day 2/ }))

    expect(itemsOf(state, "day-2").map((i) => i.id)).toEqual(["lunch"])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(row("tram")).toHaveFocus()
  })

  it("shows a viewer the stop's details, with nothing to change", () => {
    renderDay(tripOf(days(FUTURE, [[{ ...lunch, notes: "Ask for the terrace" }]])), "day-1", { surface: "sheet", editable: false })
    fireEvent.click(row("lunch"))
    const sheet = within(screen.getByRole("dialog", { name: "Lunch" }))
    expect(sheet.getByText("Ask for the terrace")).toBeInTheDocument()
    expect(sheet.queryByRole("textbox")).toBeNull()
    expect(sheet.queryByRole("button", { name: "Delete" })).toBeNull()
  })
})

describe("a stop's editor asks only for what the stop needs", () => {
  const open = (id: string) => fireEvent.click(card(id).querySelector<HTMLElement>("[data-card-row]")!)

  it("gives a place its name, time, location and notes; status, cost and links wait behind chips", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    open("lunch")
    const editor = within(card("lunch"))
    for (const name of ["Name", "Starts", "Notes"]) expect(editor.getByRole("textbox", { name })).toBeInTheDocument()
    expect(editor.getByRole("textbox", { name: "Search for a place to pin" })).toBeInTheDocument()
    expect(editor.queryByRole("combobox", { name: "Status" })).toBeNull()
    expect(editor.queryByRole("textbox", { name: "Links" })).toBeNull()
    expect(editor.queryByRole("textbox", { name: /Cost/ })).toBeNull()

    fireEvent.click(editor.getByRole("button", { name: "Add link" }))
    const links = editor.getByRole("textbox", { name: "Links" })
    expect(links).toHaveFocus()
    expect(editor.queryByRole("button", { name: "Add link" })).toBeNull()
    fireEvent.change(links, { target: { value: "example.com/menu" } })
    fireEvent.keyDown(links, { key: "Enter" })
    expect(itemsOf(state, "day-1")[0]!.links).toEqual(["https://example.com/menu"])
  })

  it("shows a field that already holds something, with no chip for it", () => {
    renderDay(tripOf(days(FUTURE, [[{ ...lunch, status: "optional" as const, cost: { amount: 20, currency: "EUR" } }]])), "day-1")
    open("lunch")
    const editor = within(card("lunch"))
    expect(editor.getByRole("combobox", { name: "Status" })).toHaveTextContent("Optional")
    expect(editor.queryByRole("button", { name: "Add status" })).toBeNull()
    expect(editor.queryByRole("button", { name: "Add cost" })).toBeNull()
    expect(editor.getByRole("button", { name: "Add link" })).toBeInTheDocument()
  })

  it("keeps a field it showed while it is emptied", () => {
    const state = renderDay(tripOf(days(FUTURE, [[{ ...lunch, notes: "Terrace" }]])), "day-1")
    open("lunch")
    const notes = within(card("lunch")).getByRole("textbox", { name: "Notes" })
    fireEvent.change(notes, { target: { value: "" } })
    expect(itemsOf(state, "day-1")[0]!.notes).toBeUndefined()
    expect(within(card("lunch")).getByRole("textbox", { name: "Notes" })).toBe(notes)
  })

  it("gives a note its words, and a time, notes and a link only when asked", () => {
    const memo = makeItem({ id: "memo", kind: "note", title: "Bring cash" })
    renderDay(tripOf(days(FUTURE, [[memo]])), "day-1")
    open("memo")
    const editor = within(card("memo"))
    expect(editor.getByRole("textbox", { name: "Note" })).toHaveValue("Bring cash")
    expect(editor.queryByRole("textbox", { name: "Starts" })).toBeNull()
    expect(editor.queryByRole("textbox", { name: "Notes" })).toBeNull()
    fireEvent.click(editor.getByRole("button", { name: "Add time" }))
    expect(editor.getByRole("textbox", { name: "Starts" })).toHaveFocus()
    expect(editor.getByRole("button", { name: "Add notes" })).toBeInTheDocument()
  })

  it("shows a booking's type, status and times, and each detail once it is filled", () => {
    const visit = makeItem({
      id: "visit",
      kind: "reservation",
      title: "AP House",
      time: "11:00",
      status: "booked",
      reservation: { type: "appointment", status: "confirmed", confirmation: "AP-221" },
    })
    renderDay(tripOf(days(FUTURE, [[visit]])), "day-1")
    open("visit")
    const editor = within(card("visit"))
    expect(editor.getByRole("combobox", { name: "Type" })).toBeInTheDocument()
    expect(editor.getByRole("combobox", { name: "Status" })).toBeInTheDocument()
    expect(editor.getByRole("textbox", { name: "Time" })).toBeInTheDocument()
    expect(editor.getByRole("textbox", { name: "Confirmation" })).toHaveValue("AP-221")
    expect(editor.queryByRole("textbox", { name: "Contact" })).toBeNull()
    expect(editor.queryByRole("textbox", { name: "Booking link" })).toBeNull()

    fireEvent.click(editor.getByRole("button", { name: "More booking details" }))
    expect(editor.getByRole("textbox", { name: "Contact" })).toBeInTheDocument()
    expect(editor.getByRole("textbox", { name: "Booking link" })).toBeInTheDocument()
  })
})

describe("a suggested start for a stop with no time", () => {
  const museum = makeItem({ id: "museum", title: "Gulbenkian" })
  const row = (id: string) => card(id).querySelector<HTMLElement>("[data-card-row]")!

  it("follows the stop before, says why, and takes focus to the time it set", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, museum]])), "day-1")
    fireEvent.click(row("museum"))
    const editor = within(card("museum"))
    const start = editor.getByRole("button", { name: "Start at 1:30 PM" })
    expect(start).toHaveAccessibleDescription("after Lunch (about 1 h there)")

    fireEvent.click(start)
    expect(itemsOf(state, "day-1").map((item) => [item.id, item.time])).toEqual([
      ["lunch", "12:30"],
      ["museum", "13:30"],
    ])
    expect(editor.getByRole("textbox", { name: "Starts" })).toHaveFocus()
    expect(editor.getByRole("textbox", { name: "Starts" })).toHaveValue("1:30 PM")
    expect(editor.queryByRole("button", { name: /^Start at/ })).toBeNull()
  })

  it("is offered in the sheet too", () => {
    renderDay(tripOf(days(FUTURE, [[lunch, museum]])), "day-1", { surface: "sheet" })
    fireEvent.click(row("museum"))
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Start at 1:30 PM" })).toBeInTheDocument()
  })

  it("is not offered with no timed stop before it", () => {
    renderDay(tripOf(days(FUTURE, [[reel, museum]])), "day-1")
    fireEvent.click(row("museum"))
    expect(within(card("museum")).queryByRole("button", { name: /^Start at/ })).toBeNull()
  })

  it("waits while the AI is working on the day", () => {
    renderDay(tripOf(days(FUTURE, [[lunch, museum]])), "day-1", { locked: true })
    fireEvent.click(row("museum"))
    expect(within(card("museum")).getByRole("button", { name: "Start at 1:30 PM" })).toBeDisabled()
  })
})

describe("a booking's status", () => {
  it("is one control, and the card's chip says what it says", () => {
    const dinner = makeItem({ id: "dinner", kind: "reservation", title: "Dinner", status: "booked", reservation: { type: "restaurant", status: "confirmed" } })
    const state = renderDay(tripOf(days(FUTURE, [[dinner]])), "day-1")
    const row = card("dinner").querySelector<HTMLElement>("[data-card-row]")!
    expect(row).toHaveTextContent("Booked")
    fireEvent.click(row)
    const status = within(card("dinner")).getByRole("combobox", { name: "Status" })
    expect(within(card("dinner")).queryByRole("combobox", { name: "Booking status" })).toBeNull()

    pickOption(status, "Pending")
    expect(itemsOf(state, "day-1")[0]).toMatchObject({ status: "needs_review", reservation: { type: "restaurant", status: "pending" } })
    expect(row).toHaveTextContent("Pending")
    expect(row).not.toHaveTextContent("Needs review")
  })
})

describe("stop links", () => {
  it("adds a pasted link as https, refuses anything that isn't a web link, and removes one", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^(?!More for).*Lunch/ }))
    fireEvent.click(within(card("lunch")).getByRole("button", { name: "Add link" }))
    const field = within(card("lunch")).getByRole("textbox", { name: "Links" })
    expect(field).toHaveAttribute("maxlength", String(LIMITS.link))

    fireEvent.change(field, { target: { value: "instagram.com/p/xyz" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(itemsOf(state, "day-1")[0]!.links).toEqual(["https://instagram.com/p/xyz"])

    fireEvent.change(field, { target: { value: "javascript:alert(1)" } })
    fireEvent.click(within(card("lunch")).getByRole("button", { name: "Add" }))
    expect(within(card("lunch")).getByText(/That isn’t a web link/)).toBeInTheDocument()
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(itemsOf(state, "day-1")[0]!.links).toEqual(["https://instagram.com/p/xyz"])

    fireEvent.click(within(card("lunch")).getByRole("button", { name: "Remove link Instagram" }))
    expect(itemsOf(state, "day-1")[0]!.links).toBeUndefined()
  })

  it("waits for the input method before taking Enter", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^(?!More for).*Lunch/ }))
    fireEvent.click(within(card("lunch")).getByRole("button", { name: "Add link" }))
    const field = within(card("lunch")).getByRole("textbox", { name: "Links" })
    fireEvent.change(field, { target: { value: "naver.me/abc" } })
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 })
    expect(itemsOf(state, "day-1")[0]!.links).toBeUndefined()
  })

  it("shows a viewer each https link by its site, opening in a new tab", () => {
    const linked = { ...lunch, links: ["https://maps.app.goo.gl/abc", "http://plain.example.com/", "javascript:alert(1)"] }
    renderDay(tripOf(days(FUTURE, [[linked]])), "day-1", { editable: false })
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^(?!More for).*Lunch/ }))
    const links = within(within(card("lunch")).getByRole("list", { name: "Links" })).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://maps.app.goo.gl/abc")
    expect(links[0]).toHaveAttribute("target", "_blank")
    expect(links[0]).toHaveAccessibleName("Google Maps (opens in a new tab)")
  })
})

describe("the To schedule heading", () => {
  it("adds its places to the route and keeps every one", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, heading, reel]])), "day-1")
    fireEvent.click(screen.getByRole("button", { name: "Add all to route" }))
    expect(itemsOf(state, "day-1").map((i) => i.id)).toEqual(["lunch", "reel"])
    expect(state.marks[state.marks.length - 1]).toMatchObject({ toast: true })
  })

  it("is a plain heading for a viewer", () => {
    renderDay(tripOf(days(FUTURE, [[lunch, heading, reel]])), "day-1", { editable: false })
    expect(screen.getByRole("heading", { name: "To schedule" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add all to route" })).toBeNull()
  })

  it("keeps a new stop above it", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, heading, reel]])), "day-1")
    const input = screen.getByRole("combobox", { name: "Add a place, note or booking" })
    fireEvent.change(input, { target: { value: "Gelato" } })
    fireEvent.click(screen.getByRole("option", { name: "Add as a note" }))
    expect(itemsOf(state, "day-1").map((i) => i.title)).toEqual(["Lunch", "Gelato", "To schedule", "From a reel"])
  })
})

describe("the stop's own menu", () => {
  it("saves a stop for later, into the trip's ideas", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch, tram]])), "day-1")
    fireEvent.click(within(card("tram")).getByRole("button", { name: /^More for / }))
    fireEvent.click(menuItem("Save for later"))
    expect(itemsOf(state, "day-1").map((i) => i.id)).toEqual(["lunch"])
    expect(state.trip.ideas?.map((i) => i.id)).toEqual(["tram"])
    expect(state.trip.ideas?.[0]?.time).toBeUndefined()
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Saved “Tram 28” for later", toast: true })
  })

  it("moves a stop to another day where its time falls, above that day's To schedule heading", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch], [tram, heading, reel]])), "day-1")
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^More for / }))
    fireEvent.click(menuItem("Move to another day…"))
    const dialog = screen.getByRole("dialog", { name: "Move “Lunch”" })
    expect(dialog).toHaveAccessibleDescription("It keeps 12:30 PM and goes where that falls on that day’s route.")
    expect(within(dialog).getByRole("button", { name: /Day 1/ })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("button", { name: /Day 2/ }))
    expect(itemsOf(state, "day-1")).toEqual([])
    expect(itemsOf(state, "day-2").map((i) => i.id)).toEqual(["lunch", "tram", "park", "reel"])
  })

  it("copies a stop to the days ticked, keeping the original where it was", () => {
    const three = tripOf(days(FUTURE.concat("2099-07-12"), [[lunch], [tram], []]), { endDate: "2099-07-12" })
    const state = renderDay(three, "day-1")
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^More for / }))
    fireEvent.click(menuItem("Copy to other days…"))
    const dialog = screen.getByRole("dialog", { name: "Copy “Lunch”" })
    expect(within(dialog).getByRole("checkbox", { name: /Day 1/ })).toBeDisabled()
    const confirm = within(dialog).getByRole("button", { name: "Copy" })
    expect(confirm).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Day 2/ }))
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Day 3/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy to 2 days" }))
    expect(itemsOf(state, "day-1").map((i) => i.id)).toEqual(["lunch"])
    const copies = [...itemsOf(state, "day-2"), ...itemsOf(state, "day-3")].filter((i) => i.title === "Lunch")
    expect(copies).toHaveLength(2)
    expect(new Set(copies.map((i) => i.id)).size).toBe(2)
    expect(copies.every((i) => i.id !== "lunch")).toBe(true)
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Copied “Lunch” to 2 days", toast: true })
  })

  it("offers only the move when the trip can't be edited as a whole", () => {
    renderDay(tripOf(days(FUTURE, [[lunch], []])), "day-1", { wholeTrip: false })
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^More for / }))
    expect(screen.queryByRole("menuitem", { name: "Save for later" })).toBeNull()
    expect(menuItem("Move to another day…")).toBeInTheDocument()
  })

  it("is not there for a viewer", () => {
    renderDay(tripOf(days(FUTURE, [[lunch], []])), "day-1", { editable: false })
    expect(screen.queryByRole("button", { name: /^More for (?!day)/ })).toBeNull()
  })
})

describe("the day's menu", () => {
  const three = () => tripOf(days(FUTURE.concat("2099-07-12"), [[lunch], [tram], []]), { endDate: "2099-07-12" })

  it("adds a blank day after this one; the days after move a date on", () => {
    const start = tripOf(days(FUTURE, [[lunch], [tram]]).map((d) => ({ ...d, city: "Lisbon" })))
    const state = renderDay(start, "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Add a day after this one"))
    expect(state.trip.days.map((d) => d.date)).toEqual(["2099-07-10", "2099-07-11", "2099-07-12"])
    expect(state.trip.days[1]).toMatchObject({ items: [], city: "Lisbon" })
    expect(state.trip.days[2]!.items.map((i) => i.id)).toEqual(["tram"])
    expect(state.trip.endDate).toBe("2099-07-12")
  })

  it("duplicates the day with new stop ids", () => {
    const state = renderDay(tripOf(days(FUTURE, [[lunch], [tram]])), "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Duplicate this day"))
    expect(state.trip.days).toHaveLength(3)
    const copy = state.trip.days[1]!
    expect(copy.items.map((i) => i.title)).toEqual(["Lunch"])
    expect(copy.items[0]!.id).not.toBe("lunch")
    expect(copy.id).not.toBe("day-1")
  })

  it("moves the day's plan a day later, trading dates with the next", () => {
    const state = renderDay(three(), "day-1")
    openDayMenu()
    expect(menuItem("Move this day earlier")).toBeDisabled()
    fireEvent.click(menuItem("Move this day later"))
    expect(state.trip.days.map((d) => d.id)).toEqual(["day-2", "day-1", "day-3"])
    expect(state.trip.days.map((d) => d.date)).toEqual(["2099-07-10", "2099-07-11", "2099-07-12"])
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Moved day 1 later", toast: true })
  })

  it("asks before deleting a day with stops, then shows the day that took its place", () => {
    const state = renderDay(three(), "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Delete this day"))
    const dialog = screen.getByRole("dialog", { name: "Delete day 1?" })
    expect(dialog).toHaveTextContent("Its 1 stop goes with it.")
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep the day" }))
    expect(state.trip.days).toHaveLength(3)

    openDayMenu()
    fireEvent.click(menuItem("Delete this day"))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete day" }))
    expect(state.trip.days.map((d) => d.id)).toEqual(["day-2", "day-3"])
    expect(state.trip.days[0]!.date).toBe("2099-07-10")
    expect(state.trip.endDate).toBe("2099-07-11")
    expect(state.path).toBe("/trips/lisbon/day/day-2")
  })

  it("deletes an empty day straight away", () => {
    const state = renderDay(three(), "day-3")
    openDayMenu(3)
    fireEvent.click(menuItem("Delete this day"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(state.trip.days).toHaveLength(2)
    expect(state.path).toBe("/trips/lisbon/day/day-2")
  })

  it("never deletes the last day", () => {
    renderDay(tripOf(days(FUTURE.slice(0, 1), [[lunch]])), "day-1")
    openDayMenu()
    expect(menuItem("Delete this day")).toBeDisabled()
  })

  it("leaves the days alone without the whole trip to edit", () => {
    renderDay(three(), "day-1", { wholeTrip: false })
    openDayMenu()
    expect(screen.queryByRole("menuitem", { name: "Delete this day" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Add a day after this one" })).toBeNull()
  })

  it("sorts on the day's clock: a 01:00 stop after a 23:00 one is already in order", () => {
    const bar = makeItem({ id: "bar", title: "Bar", time: "23:00" })
    const club = makeItem({ id: "club", title: "Club", time: "01:00" })
    renderDay(tripOf(days(FUTURE, [[bar, club]])), "day-1")
    openDayMenu()
    expect(screen.queryByRole("menuitem", { name: "Sort stops by time" })).toBeNull()
  })

  it("sorts the route and leaves the parked places under their heading", () => {
    const late = makeItem({ id: "late", title: "Dinner", time: "20:00" })
    const state = renderDay(tripOf(days(FUTURE, [[late, lunch, heading, reel]])), "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Sort stops by time"))
    expect(itemsOf(state, "day-1").map((i) => i.id)).toEqual(["lunch", "late", "park", "reel"])
  })
})

describe("the day's notes", () => {
  it("takes focus from the day's menu when there are notes already", () => {
    renderDay(tripOf(days(FUTURE, [[lunch]]).map((d) => ({ ...d, notes: "Pack the adapter" }))), "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Edit day notes"))
    expect(screen.getByRole("textbox", { name: "Day notes" })).toHaveFocus()
  })

  it("opens ready to write when there are none", () => {
    renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    openDayMenu()
    fireEvent.click(menuItem("Add day notes"))
    expect(screen.getByRole("textbox", { name: "Day notes" })).toHaveFocus()
  })
})

describe("the day's journal", () => {
  it("is there to write in on a past day, and saves like the day notes", () => {
    const state = renderDay(tripOf(days(PAST, [[lunch]])), "day-1")
    const journal = screen.getByRole("textbox", { name: "Journal" })
    expect(journal).toHaveAttribute("maxlength", String(LIMITS.journal))
    fireEvent.change(journal, { target: { value: "Rain, then the best custard tart of my life." } })
    expect(state.trip.days[0]!.journal).toBe("Rain, then the best custard tart of my life.")
    fireEvent.change(journal, { target: { value: "" } })
    expect(state.trip.days[0]).not.toHaveProperty("journal", "")
  })

  it("waits for the day", () => {
    renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    expect(screen.queryByRole("textbox", { name: "Journal" })).toBeNull()
  })

  it("reads back to a viewer, and is absent when there is nothing to read", () => {
    const written = days(PAST, [[lunch]]).map((d) => ({ ...d, journal: "A good day." }))
    renderDay(tripOf(written), "day-1", { editable: false })
    expect(screen.getByText("A good day.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Journal" })).toBeNull()
    document.body.innerHTML = ""
    renderDay(tripOf(days(PAST, [[lunch]])), "day-1", { editable: false })
    expect(screen.queryByRole("heading", { name: "Journal" })).toBeNull()
  })
})

describe("text limits and input methods", () => {
  it("caps the day's own fields at the server's limits", () => {
    renderDay(tripOf(days(FUTURE, [[lunch]])), "day-1")
    expect(screen.getByRole("combobox", { name: "Add a place, note or booking" })).toHaveAttribute("maxlength", String(LIMITS.itemTitle))
    fireEvent.click(within(card("lunch")).getByRole("button", { name: /^(?!More for).*Lunch/ }))
    expect(within(card("lunch")).getByRole("textbox", { name: "Name" })).toHaveAttribute("maxlength", String(LIMITS.itemTitle))
    expect(within(card("lunch")).getByRole("textbox", { name: "Notes" })).toHaveAttribute("maxlength", String(LIMITS.notes))
  })

  it("does not add while a word is still being composed", () => {
    const onAdd = vi.fn()
    render(<AddStop near={null} onAdd={onAdd} />)
    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "서울" } })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})

describe("DayRail", () => {
  const rail = (trip: Trip) =>
    render(
      <MemoryRouter>
        <DayRail trip={trip} basePath="/trips/lisbon" dayId="day-1" />
      </MemoryRouter>,
    )

  it("names the month on the first day and on each 1st when the trip spans months", () => {
    const trip = tripOf(days(["2099-07-30", "2099-07-31", "2099-08-01", "2099-08-02"]))
    rail(trip)
    const tabs = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link").slice(1)
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Jul30", "Fri31", "Aug1", "Sun2"])
  })

  it("keeps the weekdays when the trip sits inside one month", () => {
    rail(tripOf(days(FUTURE)))
    const tabs = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link").slice(1)
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Fri10", "Sat11"])
  })

  it("rests on today on the overview during the trip", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2099-07-11T12:00:00Z"))
    try {
      const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {})
      render(
        <MemoryRouter>
          <DayRail trip={tripOf(days(FUTURE))} basePath="/trips/lisbon" dayId={undefined} />
        </MemoryRouter>,
      )
      const today = screen.getByRole("link", { name: /Day 2, .*, today/ })
      expect(today).toHaveAttribute("data-today")
      expect(screen.getByRole("link", { name: /Day 1/ })).not.toHaveAttribute("data-today")
      expect(scrollTo).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
