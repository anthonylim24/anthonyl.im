import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, useLocation } from "react-router-dom"

const mockSearch = vi.fn(async () => ({ places: [], lead: 0 }))
vi.mock("../geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../geocode")>()),
  searchPlaces: (...args: unknown[]) => mockSearch(...(args as [])),
}))

import type { UndoMark } from "../editorMachine"
import { LIMITS } from "../limits"
import type { Trip } from "../types"
import { IdeasPanel } from "../workspace/IdeasPanel"
import { makeItem, makeTrip } from "./tripFixtures"

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

const tram = makeItem({
  id: "idea-tram",
  title: "Tram 28",
  location: { name: "Tram 28", address: "Martim Moniz, Lisbon", source: "user" },
  links: ["https://www.instagram.com/p/abc/", "http://insecure.example.com/", "javascript:alert(1)"],
})
const belem = makeItem({
  id: "idea-belem",
  title: "Pastéis de Belém",
  location: { name: "Pastéis de Belém", category: "cafe", lat: 38.6975, lng: -9.2032, source: "user" },
})
const time = makeItem({
  id: "idea-time-out",
  title: "Time Out Market",
  location: { name: "Time Out Market", category: "market", lat: 38.7069, lng: -9.1459, source: "user" },
})
const sintra = makeItem({
  id: "idea-pena",
  title: "Pena Palace",
  location: { name: "Pena Palace", category: "palace", lat: 38.7876, lng: -9.3906, source: "user" },
})

/** The panel over a live trip in a router: every edit lands, the marks are kept, the URL is read back. */
function renderIdeas(trip: Trip, { editable = true, locked = false, url = "/trips/lisbon" } = {}) {
  const state: { trip: Trip; marks: (UndoMark | undefined)[]; search: string } = { trip, marks: [], search: "" }
  function Probe() {
    state.search = useLocation().search
    return null
  }
  function Harness() {
    const [doc, setDoc] = useState(trip)
    return (
      <IdeasPanel
        trip={doc}
        basePath="/trips/lisbon"
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
  render(
    <MemoryRouter initialEntries={[url]}>
      <Harness />
      <Probe />
    </MemoryRouter>,
  )
  return state
}

const lisbon = () =>
  makeTrip({
    ideas: [tram, belem, time, sintra],
    days: [
      { id: "day-1", date: "2026-07-10", city: "Lisbon", items: [makeItem({ id: "s1", location: { name: "Rossio", lat: 38.7139, lng: -9.1394, source: "user" } })] },
      { id: "day-2", date: "2026-07-11", city: "Sintra", items: [makeItem({ id: "s2", location: { name: "Quinta", lat: 38.7964, lng: -9.3961, source: "user" } })] },
    ],
  })

/** The ideas a list shows, in order, by the id on each name. */
const anchors = (list: HTMLElement) => [...list.querySelectorAll("[data-idea-anchor]")].map((node) => node.getAttribute("data-idea-anchor"))

describe("IdeasPanel", () => {
  it("says what it is for when nothing is saved", () => {
    renderIdeas(makeTrip())
    expect(screen.getByRole("heading", { name: "Wishlist" })).toBeInTheDocument()
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Save a place for later" })).toHaveAttribute("maxlength", String(LIMITS.itemTitle))
    // Nothing to filter or group yet.
    expect(screen.queryByRole("radiogroup", { name: "Group by" })).toBeNull()
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
    expect(within(screen.getByRole("list", { name: "1 place on the wishlist" })).getByText("Pastéis de Belém")).toBeInTheDocument()
  })

  it("shows an idea's address, its category and https links only, each opening in a new tab", () => {
    renderIdeas(makeTrip({ ideas: [tram] }))
    const row = screen.getByText("Tram 28").closest("li")!
    expect(within(row).getByText("Martim Moniz, Lisbon")).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: "Category for Tram 28: Other (automatic)" })).toBeInTheDocument()
    const links = within(row).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://www.instagram.com/p/abc/")
    expect(links[0]).toHaveAttribute("target", "_blank")
    expect(links[0]).toHaveAttribute("rel", "noreferrer")
    expect(links[0]).toHaveAccessibleName(/Instagram \(opens in a new tab\)/)
  })

  it("opens an idea's details from its name, pushing ?idea= and anchoring on the name", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }), { url: "/trips/lisbon?tab=wishlist" })
    const name = screen.getByRole("button", { name: "Tram 28" })
    expect(name).toHaveAttribute("data-idea-anchor", "idea-tram")
    expect(name).toHaveAttribute("aria-haspopup", "dialog")
    fireEvent.click(name)
    const params = new URLSearchParams(state.search)
    expect(params.get("idea")).toBe("idea-tram")
    expect(params.get("add")).toBeNull()
    // The tab it was opened from stays.
    expect(params.get("tab")).toBe("wishlist")
  })

  it("opens the day picker from Add to day with ?idea=&add=1", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }))
    fireEvent.click(screen.getByRole("button", { name: "Add to day: Tram 28" }))
    const params = new URLSearchParams(state.search)
    expect(params.get("idea")).toBe("idea-tram")
    expect(params.get("add")).toBe("1")
    // The panel no longer opens a picker of its own: the overlay does.
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("files an idea under a category, then back to automatic, each as one undoable edit", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }))
    fireEvent.click(screen.getByRole("button", { name: "Category for Tram 28: Other (automatic)" }))
    const menu = screen.getByRole("menu")
    // Automatic leads, naming what it would infer, and is the current choice.
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Automatic (Other)",
      "Food & cafés",
      "Nature & outdoors",
      "Sights & culture",
      "Neighborhoods",
      "Shopping",
      "Bars & nightlife",
      "Experiences",
      "Other",
    ])
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sights & culture" }))
    expect(state.trip.ideas?.[0]?.theme).toBe("sights")
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Filed “Tram 28” under Sights & culture" })

    fireEvent.click(screen.getByRole("button", { name: "Category for Tram 28: Sights & culture" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Automatic (Other)" }))
    expect(state.trip.ideas?.[0]).not.toHaveProperty("theme")
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Filed “Tram 28” automatically" })
  })

  it("records nothing when the same category is picked again", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }))
    fireEvent.click(screen.getByRole("button", { name: /Category for Tram 28/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Automatic (Other)" }))
    expect(state.marks).toEqual([])
  })

  it("filters by type with pressed chips that count each type", () => {
    renderIdeas(lisbon())
    const chips = within(screen.getByRole("group", { name: "Show by type" })).getAllByRole("button")
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "All, 4 places",
      "Food & cafés, 2 places",
      "Sights & culture, 1 place",
      "Other, 1 place",
    ])
    expect(chips[0]).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Food & cafés, 2 places" }))
    expect(screen.getByRole("button", { name: "Food & cafés, 2 places" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "All, 4 places" })).toHaveAttribute("aria-pressed", "false")
    const list = screen.getByRole("list", { name: "2 places in Food & cafés" })
    expect(anchors(list)).toEqual(["idea-belem", "idea-time-out"])
    expect(screen.queryByText("Pena Palace")).toBeNull()
  })

  it("says so, and offers everything back, when a filter has nothing left", () => {
    renderIdeas(lisbon())
    fireEvent.click(screen.getByRole("button", { name: "Sights & culture, 1 place" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Pena Palace" }))
    // The chip stays, now at zero, so the choice does not vanish under the pointer.
    expect(screen.getByRole("button", { name: "Sights & culture, 0 places" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/Nothing under Sights & culture now/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(screen.getByRole("list", { name: "3 places on the wishlist" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Sights & culture/ })).toBeNull()
  })

  it("groups by type under headings, in the category order", () => {
    renderIdeas(lisbon())
    fireEvent.click(screen.getByRole("radio", { name: "Type" }))
    expect(screen.getByRole("radio", { name: "Type" })).toHaveAttribute("aria-checked", "true")
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(["Food & cafés2, 2 places", "Sights & culture1, 1 place", "Other1, 1 place"])
    expect(anchors(screen.getByRole("list", { name: /Food & cafés/ }))).toEqual(["idea-belem", "idea-time-out"])
  })

  it("groups by area: the trip's cities in day order, then the rest", () => {
    renderIdeas(lisbon())
    fireEvent.click(screen.getByRole("radio", { name: "Area" }))
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.firstChild?.textContent)
    // Tram 28 has no pin, but its address names Lisbon.
    expect(headings).toEqual(["Lisbon", "Sintra"])
    expect(anchors(screen.getByRole("list", { name: /Lisbon/ }))).toEqual(["idea-tram", "idea-belem", "idea-time-out"])
    expect(within(screen.getByRole("list", { name: /Sintra/ })).getByText("Pena Palace")).toBeInTheDocument()
  })

  it("filters and groups together", () => {
    renderIdeas(lisbon())
    fireEvent.click(screen.getByRole("button", { name: "Food & cafés, 2 places" }))
    fireEvent.click(screen.getByRole("radio", { name: "Area" }))
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.firstChild?.textContent)).toEqual(["Lisbon"])
  })

  it("moves the grouping with the arrow keys and remembers it on this device", () => {
    renderIdeas(lisbon())
    const none = screen.getByRole("radio", { name: "None" })
    expect(none).toHaveAttribute("aria-checked", "true")
    expect(none).toHaveAttribute("tabindex", "0")
    const outside = vi.fn()
    document.addEventListener("keydown", outside)
    fireEvent.keyDown(none, { key: "ArrowRight" })
    document.removeEventListener("keydown", outside)
    // The workspace's ←/→ day keys never see it.
    expect(outside).not.toHaveBeenCalled()
    expect(screen.getByRole("radio", { name: "Type" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "Type" })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole("radio", { name: "Type" }), { key: "ArrowLeft" })
    fireEvent.keyDown(screen.getByRole("radio", { name: "None" }), { key: "ArrowLeft" })
    expect(screen.getByRole("radio", { name: "Area" })).toHaveAttribute("aria-checked", "true")
    expect(localStorage.getItem("trips-wishlist-group")).toBe("area")
  })

  it("starts with the remembered grouping", () => {
    localStorage.setItem("trips-wishlist-group", "type")
    renderIdeas(lisbon())
    expect(screen.getByRole("radio", { name: "Type" })).toHaveAttribute("aria-checked", "true")
  })

  it("lists a single idea plainly, whatever grouping was remembered", () => {
    localStorage.setItem("trips-wishlist-group", "area")
    renderIdeas(makeTrip({ ideas: [tram] }))
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull()
    expect(screen.getByRole("list", { name: "1 place on the wishlist" })).toBeInTheDocument()
  })

  it("still groups when storage throws (private mode), for this page only", () => {
    const fail = () => {
      throw new Error("blocked")
    }
    const get = vi.spyOn(localStorage, "getItem").mockImplementation(fail)
    const set = vi.spyOn(localStorage, "setItem").mockImplementation(fail)
    renderIdeas(lisbon())
    expect(screen.getByRole("radio", { name: "None" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("radio", { name: "Area" }))
    expect(screen.getByRole("radio", { name: "Area" })).toHaveAttribute("aria-checked", "true")
    get.mockRestore()
    set.mockRestore()
  })

  it("removes an idea and marks the step for an Undo toast", () => {
    const state = renderIdeas(makeTrip({ ideas: [tram] }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Tram 28" }))
    expect(state.trip.ideas).toEqual([])
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Removed “Tram 28” from the wishlist", toast: true })
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
  })

  it("is read only for a viewer: details open, nothing changes", () => {
    renderIdeas(makeTrip({ ideas: [tram, belem] }), { editable: false })
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: /Add to day/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Category for/ })).toBeNull()
    // The category shows as text.
    expect(within(screen.getByText("Pastéis de Belém").closest("li")!).getByText("Food & cafés")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tram 28" })).toBeEnabled()
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.instagram.com/p/abc/")
  })

  it("tells a viewer plainly when there is nothing", () => {
    renderIdeas(makeTrip(), { editable: false })
    expect(screen.getByText("Nothing saved for later yet.")).toBeInTheDocument()
  })

  it("holds every change while the trip is locked, but still opens details", () => {
    renderIdeas(makeTrip({ ideas: [tram] }), { locked: true })
    expect(screen.getByRole("combobox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add to day: Tram 28" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remove Tram 28" })).toBeDisabled()
    // No category menu while an AI run owns the trip: the category as text.
    expect(screen.queryByRole("button", { name: /Category for/ })).toBeNull()
    expect(screen.getByText("Other")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tram 28" })).toBeEnabled()
  })

  describe("places that have a day now", () => {
    const scheduled = () =>
      makeTrip({
        ideas: [tram],
        days: [
          { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "s1", title: "Rossio" })] },
          {
            id: "day-2",
            date: "2026-07-11",
            items: [makeItem({ id: "sintra-stop", title: "Sintra", time: "08:30", fromWishlist: true }), makeItem({ id: "s2", title: "Quinta" })],
          },
        ],
      })

    it("lists them after the wishlist, each linking to its stop on its day", () => {
      renderIdeas(scheduled())
      expect(screen.getByText("1 place to fit in · 1 on your days")).toBeInTheDocument()
      const group = screen.getByRole("list", { name: /On your days/ })
      expect(within(group).getByText("Sintra")).toBeInTheDocument()
      const link = within(group).getByRole("link", { name: "Sintra: Day 2 · Sat Jul 11 · 8:30 AM. Open the day" })
      expect(link).toHaveAttribute("href", "/trips/lisbon/day/day-2#stop-sintra-stop")
      // Not counted as waiting on the wishlist, and not listed with the others.
      expect(within(screen.getByRole("list", { name: "1 place on the wishlist" })).queryByText("Sintra")).toBeNull()
    })

    it("sends one back to the wishlist with an Undo toast", () => {
      const state = renderIdeas(scheduled())
      fireEvent.click(screen.getByRole("button", { name: "Back to wishlist: Sintra" }))
      expect(state.trip.days[1]!.items.map((i) => i.id)).toEqual(["s2"])
      expect(state.trip.ideas!.map((i) => i.id)).toEqual(["idea-tram", "sintra-stop"])
      expect(state.trip.ideas![1]!.fromWishlist).toBeUndefined()
      expect(state.marks[state.marks.length - 1]).toEqual({ label: "Moved “Sintra” back to the wishlist", toast: true })
      expect(screen.queryByRole("list", { name: /On your days/ })).toBeNull()
    })

    it("says so when every saved place has a day, and offers no way back to a viewer", () => {
      renderIdeas(makeTrip({ ...scheduled(), ideas: [] }), { editable: false })
      expect(screen.getByText("Everything you saved has a day now.")).toBeInTheDocument()
      expect(screen.queryByText(/to fit in/)).toBeNull()
      expect(screen.getByRole("link", { name: /Sintra: Day 2/ })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Back to wishlist/ })).toBeNull()
    })
  })

  it("stops taking new ideas at the limit and says why", () => {
    const ideas = Array.from({ length: LIMITS.ideas }, (_, i) => makeItem({ id: `idea-${i}`, title: `Idea ${i}` }))
    renderIdeas(makeTrip({ ideas }))
    expect(screen.getByRole("combobox")).toBeDisabled()
    expect(screen.getByText(`The list is full at ${LIMITS.ideas}. Remove one to save another.`)).toBeInTheDocument()
  })
})
