import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"

const mockSearch = vi.fn(async () => [])
vi.mock("../geocode", () => ({ searchPlaces: (...args: unknown[]) => mockSearch(...(args as [])) }))

import type { UndoMark } from "../editorMachine"
import { LIMITS } from "../limits"
import type { Trip } from "../types"
import { IdeasPanel } from "../workspace/IdeasPanel"
import { makeItem, makeTrip } from "./tripFixtures"

afterEach(() => vi.clearAllMocks())

const heading = makeItem({ id: "park", kind: "section", title: "To schedule" })
const tram = makeItem({
  id: "idea-tram",
  title: "Tram 28",
  location: { name: "Tram 28", address: "Martim Moniz, Lisbon", source: "user" },
  links: ["https://www.instagram.com/p/abc/", "http://insecure.example.com/", "javascript:alert(1)"],
})

/** The panel over a live trip: every edit lands, and the marks are kept. */
function renderIdeas(trip: Trip, { editable = true, locked = false } = {}) {
  const state: { trip: Trip; marks: (UndoMark | undefined)[] } = { trip, marks: [] }
  function Harness() {
    const [doc, setDoc] = useState(trip)
    return (
      <IdeasPanel
        trip={doc}
        editable={editable}
        locked={locked}
        near={null}
        onEdit={(fn, mark) => {
          state.trip = fn(state.trip)
          state.marks.push(mark)
          setDoc(state.trip)
        }}
      />
    )
  }
  render(<Harness />)
  return state
}

describe("IdeasPanel", () => {
  it("says what it is for when nothing is saved", () => {
    renderIdeas(makeTrip())
    expect(screen.getByRole("heading", { name: "Ideas" })).toBeInTheDocument()
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Save a place for later" })).toHaveAttribute("maxlength", String(LIMITS.itemTitle))
  })

  it("saves a typed place for later, through the same field a day uses", () => {
    const state = renderIdeas(makeTrip())
    const input = screen.getByRole("combobox", { name: "Save a place for later" })
    fireEvent.change(input, { target: { value: "Pastéis de Belém" } })
    // A place only: no note, booking or heading options here.
    expect(screen.queryByRole("option", { name: /as a note/ })).toBeNull()
    expect(screen.queryByRole("option", { name: /as a heading/ })).toBeNull()
    fireEvent.click(screen.getByRole("option", { name: "Add “Pastéis de Belém” without a pin" }))
    expect(state.trip.ideas?.map((idea) => idea.title)).toEqual(["Pastéis de Belém"])
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Saved “Pastéis de Belém” for later" })
    expect(within(screen.getByRole("list", { name: "1 idea" })).getByText("Pastéis de Belém")).toBeInTheDocument()
  })

  it("shows an idea's address and https links only, each opening in a new tab", () => {
    renderIdeas(makeTrip({ ideas: [tram] }))
    const row = screen.getByText("Tram 28").closest("li")!
    expect(within(row).getByText("Martim Moniz, Lisbon")).toBeInTheDocument()
    const links = within(row).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://www.instagram.com/p/abc/")
    expect(links[0]).toHaveAttribute("target", "_blank")
    expect(links[0]).toHaveAttribute("rel", "noreferrer")
    expect(links[0]).toHaveAccessibleName(/Instagram \(opens in a new tab\)/)
  })

  it("adds an idea to a day, above the day's To schedule heading, and takes it off the list", () => {
    const planned = makeItem({ id: "lunch", title: "Lunch" })
    const parked = makeItem({ id: "ig-1", title: "From a reel" })
    const trip = makeTrip({
      ideas: [tram],
      days: [
        { id: "day-1", date: "2026-07-10", items: [] },
        { id: "day-2", date: "2026-07-11", city: "Sintra", items: [planned, heading, parked] },
      ],
    })
    const state = renderIdeas(trip)
    fireEvent.click(screen.getByRole("button", { name: "Add to day: Tram 28" }))
    const dialog = screen.getByRole("dialog", { name: "Add “Tram 28” to a day" })
    const day2 = within(dialog).getByRole("button", { name: /Day 2/ })
    expect(day2).toHaveTextContent("Sintra · 2 stops")
    fireEvent.click(day2)
    expect(state.trip.days[1]!.items.map((item) => item.id)).toEqual(["lunch", "idea-tram", "park", "ig-1"])
    expect(state.trip.ideas).toEqual([])
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Added “Tram 28” to day 2" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Added Tram 28 to day 2")
  })

  it("offers a full day but will not add to it", () => {
    const items = Array.from({ length: LIMITS.itemsPerDay }, (_, i) => makeItem({ id: `s-${i}`, title: `Stop ${i}` }))
    const trip = makeTrip({ ideas: [tram], days: [{ id: "day-1", date: "2026-07-10", items }] })
    renderIdeas(trip)
    fireEvent.click(screen.getByRole("button", { name: "Add to day: Tram 28" }))
    const day1 = within(screen.getByRole("dialog")).getByRole("button", { name: /Day 1/ })
    expect(day1).toBeDisabled()
    expect(day1).toHaveTextContent("Full")
  })

  it("removes an idea and marks the step for an Undo toast (recorded once the history covers ideas)", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Tram 28" }))
    expect(state.trip.ideas).toEqual([])
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Removed “Tram 28” from ideas", toast: true })
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
  })

  it("is read only for a viewer", () => {
    renderIdeas(makeTrip({ ideas: [tram] }), { editable: false })
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Tram 28")).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.instagram.com/p/abc/")
  })

  it("tells a viewer plainly when there is nothing", () => {
    renderIdeas(makeTrip(), { editable: false })
    expect(screen.getByText("Nothing saved for later yet.")).toBeInTheDocument()
  })

  it("holds every control while the trip is locked", () => {
    renderIdeas(makeTrip({ ideas: [tram] }), { locked: true })
    expect(screen.getByRole("combobox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add to day: Tram 28" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remove Tram 28" })).toBeDisabled()
  })

  it("stops taking new ideas at the limit and says why", () => {
    const ideas = Array.from({ length: LIMITS.ideas }, (_, i) => makeItem({ id: `idea-${i}`, title: `Idea ${i}` }))
    renderIdeas(makeTrip({ ideas }))
    expect(screen.getByRole("combobox")).toBeDisabled()
    expect(screen.getByText(`The list is full at ${LIMITS.ideas}. Remove one to save another.`)).toBeInTheDocument()
  })
})
