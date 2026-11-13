import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { PlaceResult } from "../geocode"
import type { AtlasMapProps } from "../map/AtlasMap"
import type { Trip, TripAccess, TripDay } from "../types"
import { makeItem, makeTrip, stubMatchMedia } from "./tripFixtures"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  useViewer: () => ({ id: "u1", name: "Ant" }),
  clerkEnabled: true,
}))

const mockGetTrip = vi.fn()
const mockUpdateTrip = vi.fn()
const mockEnhanceTrip = vi.fn()
const mockGenerateItinerary = vi.fn()
const mockDeleteTrip = vi.fn()
const mockDuplicateTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  enhanceTrip: (...args: unknown[]) => mockEnhanceTrip(...args),
  generateItinerary: (...args: unknown[]) => mockGenerateItinerary(...args),
  deleteTrip: (...args: unknown[]) => mockDeleteTrip(...args),
  duplicateTrip: (...args: unknown[]) => mockDuplicateTrip(...args),
  applySuggestions: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  leaveTrip: vi.fn(),
}))

const mockSearchPlaces = vi.fn()

vi.mock("../geocode", () => ({
  searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
  searchCities: vi.fn().mockResolvedValue([]),
  cityLabel: (city: { name: string }) => city.name,
}))

// The real map needs WebGL. The stub lists its pins as buttons that select
// the pin, and renders the overlay children (map chip, selected-place card).
vi.mock("../map/AtlasMap", () => ({
  AtlasMap: ({ pins, dots, routes, label, onSelect, children }: AtlasMapProps) => (
    <div role="region" aria-label={label}>
      <p>{`${dots?.length ?? 0} dots, ${routes?.length ?? 0} routes`}</p>
      {pins.map((pin) => (
        <button key={pin.id} type="button" onClick={() => onSelect?.(pin.id)}>
          {`Pin ${pin.label}: ${pin.title}`}
        </button>
      ))}
      {children}
    </div>
  ),
}))

import { TripWorkspace } from "../TripWorkspace"

const market = makeItem({
  id: "it-market",
  title: "Time Out Market",
  time: "12:30",
  location: { name: "Time Out Market", address: "Av. 24 de Julho 49", lat: 38.7067, lng: -9.1459, category: "market", source: "user" },
})
const cash = makeItem({ id: "it-cash", kind: "note", title: "Bring cash" })
const unpinned = makeItem({ id: "it-cafe", title: "Mystery cafe", location: { name: "Mystery cafe", source: "user" } })
const fado = makeItem({
  id: "it-fado",
  kind: "reservation",
  title: "Fado dinner",
  time: "20:00",
  status: "booked",
  location: { name: "Clube de Fado", lat: 38.7108, lng: -9.1303, source: "user" },
  reservation: { type: "meal", status: "confirmed", confirmation: "FD-2291" },
})

function planned(overrides: Partial<Trip> = {}): Trip {
  return makeTrip({
    description: "Trams, tiles and pastries.",
    center: { lat: 38.72, lng: -9.14 },
    days: [
      { id: "day-1", date: "2026-07-10", title: "Arrival", city: "Lisbon", items: [market, cash, unpinned, fado] },
      { id: "day-2", date: "2026-07-11", items: [] },
    ],
    ...overrides,
  })
}

function renderWorkspace(path: string, trip: Trip = planned(), access: TripAccess = "owner") {
  mockGetTrip.mockResolvedValue({ trip, access })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/:tripId" element={<TripWorkspace />} />
        <Route path="/trips/:tripId/day/:dayId" element={<TripWorkspace />} />
        <Route path="/trips" element={<p>All trips page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const stat = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement

const belem: PlaceResult = {
  id: "W123",
  name: "Belém Tower",
  context: "Avenida Brasília, Lisbon, Portugal",
  address: "Avenida Brasília, Lisbon, Portugal",
  lat: 38.6916,
  lng: -9.2159,
  category: "palace",
}

describe("TripWorkspace", () => {
  beforeEach(() => {
    stubMatchMedia(true)
    mockUpdateTrip.mockImplementation(async (_getToken: unknown, _id: string, patch: Partial<Trip>) => ({ ...planned(), ...patch }))
    mockSearchPlaces.mockResolvedValue([belem])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("overview", () => {
    it("shows stats, a row per day, and the bookings", async () => {
      renderWorkspace("/trips/lisbon")

      expect(await screen.findByRole("textbox", { name: "Trip name" })).toHaveValue("Lisbon Long Weekend")
      expect(mockGetTrip.mock.calls[0]![1]).toBe("lisbon")
      expect(screen.getByText("Trams, tiles and pastries.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Jul 10 – 11, 2026 · 2 days/ })).toBeInTheDocument()

      expect(stat("Days")).toHaveTextContent("Days2")
      expect(stat("Pinned")).toHaveTextContent("Pinned2")
      expect(stat("Bookings")).toHaveTextContent("Bookings1")

      const days = within(screen.getByRole("region", { name: "Day by day" }))
      const rows = days.getAllByRole("link")
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveAttribute("href", "/trips/lisbon/day/day-1")
      expect(rows[0]).toHaveTextContent("Arrival")
      expect(rows[0]).toHaveTextContent("Time Out Market · Bring cash · Mystery cafe · +1")
      // One city for the whole trip, so the rows don't repeat it.
      expect(rows[0]).not.toHaveTextContent("Lisbon")
      expect(rows[1]).toHaveAttribute("href", "/trips/lisbon/day/day-2")
      expect(rows[1]).toHaveTextContent("Day 2")
      expect(rows[1]).toHaveTextContent("Nothing yet. Open to add stops.")

      const bookings = within(screen.getByRole("region", { name: "Bookings" }))
      const booking = bookings.getByRole("link", { name: /Fado dinner/ })
      expect(booking).toHaveAttribute("href", "/trips/lisbon/day/day-1#item-it-fado")
      expect(booking).toHaveTextContent("8:00 PM")
      expect(booking).toHaveTextContent("FD-2291")
      expect(booking).toHaveTextContent("Confirmed")

      // The rail links the overview and each day.
      const rail = within(screen.getByRole("navigation", { name: "Days" }))
      expect(rail.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
      expect(rail.getByRole("link", { name: /^Day 1, Friday, July 10, 4 items$/ })).toHaveAttribute("href", "/trips/lisbon/day/day-1")
      expect(rail.getByRole("link", { name: /^Day 2, .*0 items$/ })).not.toHaveAttribute("aria-current")
    })

    it("maps one pin per day, with every located stop as a dot and no routes", async () => {
      const trip = planned()
      trip.days[1] = {
        id: "day-2",
        date: "2026-07-11",
        title: "Belém",
        items: [makeItem({ id: "it-tower", title: "Tower", location: { name: "Tower", lat: 38.6916, lng: -9.2159, source: "user" } })],
      }
      renderWorkspace("/trips/lisbon", trip)

      const map = within(await screen.findByRole("region", { name: "Map of the whole trip with 2 pinned places" }))
      expect(map.getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Pin 1: Day 1, Arrival: 2 pinned stops",
        "Pin 2: Day 2, Belém: 1 pinned stop",
      ])
      expect(map.getByText("3 dots, 0 routes")).toBeInTheDocument()
      expect(map.getByText("All days · 2 pins")).toBeInTheDocument()
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("leaves days with nothing pinned off the map", async () => {
      renderWorkspace("/trips/lisbon")
      const map = within(await screen.findByRole("region", { name: "Map of the whole trip with 1 pinned place" }))
      expect(map.getAllByRole("button").map((b) => b.textContent)).toEqual(["Pin 1: Day 1, Arrival: 2 pinned stops"])
      expect(map.getByText("2 dots, 0 routes")).toBeInTheDocument()
    })

    it("opens the day when its map pin is clicked", async () => {
      renderWorkspace("/trips/lisbon")
      fireEvent.click(await screen.findByRole("button", { name: "Pin 1: Day 1, Arrival: 2 pinned stops" }))

      expect(await screen.findByRole("textbox", { name: "Day title" })).toHaveValue("Arrival")
      expect(screen.getByRole("region", { name: "Map of day 1 with 2 pinned stops" })).toBeInTheDocument()
      // No place card on the way: the pin is a day, not a stop.
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("shows Stops instead of Bookings when nothing is booked, and city chips for multi-city trips", async () => {
      renderWorkspace(
        "/trips/lisbon",
        planned({
          days: [
            { id: "day-1", date: "2026-07-10", title: "Arrival", city: "Lisbon", items: [market, cash, unpinned] },
            { id: "day-2", date: "2026-07-11", city: "Porto", items: [] },
          ],
        }),
      )

      await screen.findByRole("region", { name: "Day by day" })
      // The note is not a stop.
      expect(stat("Stops")).toHaveTextContent("Stops2")
      expect(screen.queryByText("Bookings")).toBeNull()
      expect(stat("Walking")).toHaveTextContent("Walking–")
      expect(screen.queryByText("On foot")).toBeNull()

      const rows = within(screen.getByRole("region", { name: "Day by day" })).getAllByRole("link")
      expect(rows[0]).toHaveTextContent("Lisbon")
      expect(rows[1]).toHaveTextContent("Porto")
    })

    it("drafts an empty trip with AI from the overview", async () => {
      const empty = makeTrip()
      const drafted = planned()
      mockGenerateItinerary.mockResolvedValue({ trip: drafted, summary: "Drafted a food-first weekend." })
      renderWorkspace("/trips/lisbon", empty)

      expect(await screen.findByRole("heading", { name: "Let AI sketch all 2 days" })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "I’ll add stops myself" })).toHaveAttribute("href", "/trips/lisbon/day/day-1")
      fireEvent.click(screen.getByRole("radio", { name: "Packed" }))
      fireEvent.click(screen.getByRole("button", { name: "Coffee" }))
      fireEvent.click(screen.getByRole("button", { name: "Draft itinerary" }))

      await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
      expect(mockGenerateItinerary.mock.calls[0]!.slice(1)).toEqual([
        "lisbon",
        { prompt: undefined, preferences: { pace: "packed", interests: "Coffee" }, replaceExisting: false },
      ])

      // The drafted trip replaces the empty one and the summary is announced.
      expect(await screen.findByText("Drafted a food-first weekend.")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Draft itinerary" })).toBeNull()
      expect(stat("Pinned")).toHaveTextContent("Pinned2")
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeInTheDocument()
    })

    it("explains a failed draft and leaves the trip alone", async () => {
      mockGenerateItinerary.mockRejectedValue(new Error("upstream timeout"))
      renderWorkspace("/trips/lisbon", makeTrip())

      fireEvent.click(await screen.findByRole("button", { name: "Draft itinerary" }))
      expect(
        await screen.findByText("The draft didn’t finish, so nothing changed. Try again in a moment. (upstream timeout)"),
      ).toBeInTheDocument()
      // Problems are announced as alerts, not polite status updates.
      expect(screen.getByRole("alert")).toHaveTextContent("The draft didn’t finish")
      expect(screen.getByRole("button", { name: "Draft itinerary" })).toBeEnabled()
    })

    it("does not offer the AI draft once the trip has stops", async () => {
      renderWorkspace("/trips/lisbon")
      await screen.findByRole("region", { name: "Day by day" })
      expect(screen.queryByRole("button", { name: "Draft itinerary" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Draft with AI" })).toBeNull()
    })
  })

  describe("day page", () => {
    it("lists the day's items and numbers only the located ones", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")

      expect(await screen.findByRole("textbox", { name: "Day title" })).toHaveValue("Arrival")
      expect(screen.getByText(/Day 1 of 2 · Friday, July 10/)).toBeInTheDocument()

      const plan = within(screen.getByRole("region", { name: "Day 1 plan" }))
      expect(plan.getAllByRole("listitem")).toHaveLength(4)
      for (const title of ["Time Out Market", "Bring cash", "Mystery cafe", "Fado dinner"]) {
        expect(plan.getByText(title)).toBeInTheDocument()
      }

      const markers = plan.getAllByRole("button", { name: /^Show .* on the map$/ })
      expect(markers.map((m) => [m.getAttribute("aria-label"), m.textContent])).toEqual([
        ["Show Time Out Market on the map", "1"],
        ["Show Fado dinner on the map", "2"],
      ])
      expect(plan.queryByRole("button", { name: "Show Bring cash on the map" })).toBeNull()
      expect(plan.queryByRole("button", { name: "Show Mystery cafe on the map" })).toBeNull()

      const map = within(screen.getByRole("region", { name: "Map of day 1 with 2 pinned stops" }))
      expect(map.getAllByRole("button").map((b) => b.textContent)).toEqual(["Pin 1: Time Out Market", "Pin 2: Fado dinner"])
      expect(map.getByText("Day 1 · Lisbon · 2 pins")).toBeInTheDocument()

      expect(within(screen.getByRole("navigation", { name: "Days" })).getByRole("link", { name: /^Day 1,/ })).toHaveAttribute(
        "aria-current",
        "page",
      )
      expect(within(screen.getByRole("navigation", { name: "Other days" })).getByRole("link")).toHaveAttribute(
        "href",
        "/trips/lisbon/day/day-2",
      )
    })

    it("shows the selected-place card when a marker is clicked", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Show Time Out Market on the map" }))

      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Time Out Market" })).toBeInTheDocument()
      expect(card.getByText("Stop 1 of 2 · 12:30 PM · Market")).toBeInTheDocument()
      expect(card.getByText("Av. 24 de Julho 49")).toBeInTheDocument()
      expect(card.getByRole("link", { name: "Directions" })).toHaveAttribute("target", "_blank")
      // On the day page there is no "open day" hop.
      expect(card.queryByRole("link", { name: /Open day/ })).toBeNull()

      fireEvent.keyDown(document.body, { key: "Escape" })
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("shows the card when a map pin is clicked, and closes it from the card", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Pin 2: Fado dinner" }))

      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()
      expect(card.getByText("Stop 2 of 2 · 8:00 PM")).toBeInTheDocument()

      fireEvent.click(card.getByRole("button", { name: "Close place" }))
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("steps through the day's pinned stops from the place card", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Show Time Out Market on the map" }))
      const card = () => within(screen.getByRole("complementary", { name: "Selected place" }))

      expect(card().getByRole("button", { name: "Previous stop" })).toBeDisabled()
      expect(card().getByRole("button", { name: "Next stop" })).toBeEnabled()

      // Next skips the unpinned note and café between the two pinned stops.
      fireEvent.click(card().getByRole("button", { name: "Next stop" }))
      expect(card().getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()
      expect(card().getByText("Stop 2 of 2 · 8:00 PM")).toBeInTheDocument()
      expect(card().getByRole("button", { name: "Next stop" })).toBeDisabled()

      fireEvent.click(card().getByRole("button", { name: "Previous stop" }))
      expect(card().getByRole("heading", { name: "Time Out Market" })).toBeInTheDocument()
      expect(card().getByText("Stop 1 of 2 · 12:30 PM · Market")).toBeInTheDocument()
    })

    it("has no stepper when the day has a single pinned stop", async () => {
      renderWorkspace(
        "/trips/lisbon/day/day-1",
        planned({ days: [{ id: "day-1", date: "2026-07-10", items: [market, cash] }, { id: "day-2", date: "2026-07-11", items: [] }] }),
      )
      fireEvent.click(await screen.findByRole("button", { name: "Show Time Out Market on the map" }))

      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByText("Stop 1 of 1 · 12:30 PM · Market")).toBeInTheDocument()
      expect(card.queryByRole("button", { name: "Previous stop" })).toBeNull()
      expect(card.queryByRole("button", { name: "Next stop" })).toBeNull()
    })

    it("opens the stop's editor from the place card", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const row = await screen.findByRole("button", { name: /Time Out Market/, expanded: false })
      fireEvent.click(screen.getByRole("button", { name: "Show Time Out Market on the map" }))
      expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull()

      fireEvent.click(within(screen.getByRole("complementary", { name: "Selected place" })).getByRole("button", { name: "Edit stop" }))

      expect(row).toHaveAttribute("aria-expanded", "true")
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Time Out Market")
    })

    it("reorders a stop with Alt+Arrow and announces the move", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const plan = () => within(screen.getByRole("region", { name: "Day 1 plan" }))
      const order = () =>
        plan()
          .getAllByRole("listitem")
          .map((li) => li.querySelector("[id^='item-']")?.id)
      const row = (name: RegExp) => plan().getByRole("button", { name, expanded: false })

      await screen.findByRole("textbox", { name: "Day title" })
      expect(order()).toEqual(["item-it-market", "item-it-cash", "item-it-cafe", "item-it-fado"])
      expect(row(/Time Out Market/)).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown")

      fireEvent.keyDown(row(/Time Out Market/), { key: "ArrowDown", altKey: true })
      expect(order()).toEqual(["item-it-cash", "item-it-market", "item-it-cafe", "item-it-fado"])
      expect(screen.getByText("Time Out Market moved down, now 2 of 4.")).toHaveAttribute("aria-live", "polite")

      fireEvent.keyDown(row(/Fado dinner/), { key: "ArrowUp", altKey: true })
      expect(order()).toEqual(["item-it-cash", "item-it-market", "item-it-fado", "item-it-cafe"])
      expect(screen.getByText("Fado dinner moved up, now 3 of 4.")).toBeInTheDocument()
      // Pin numbers follow the new order.
      expect(screen.getByRole("button", { name: "Show Time Out Market on the map" })).toHaveTextContent("1")
      expect(screen.getByRole("button", { name: "Show Fado dinner on the map" })).toHaveTextContent("2")

      // Edges and plain arrows do nothing.
      fireEvent.keyDown(row(/Bring cash/), { key: "ArrowUp", altKey: true })
      fireEvent.keyDown(row(/Mystery cafe/), { key: "ArrowDown", altKey: true })
      fireEvent.keyDown(row(/Bring cash/), { key: "ArrowDown" })
      expect(order()).toEqual(["item-it-cash", "item-it-market", "item-it-fado", "item-it-cafe"])
      expect(screen.getByText("Fado dinner moved up, now 3 of 4.")).toBeInTheDocument()
    })

    it("does not reorder for a viewer", async () => {
      renderWorkspace("/trips/lisbon/day/day-1", planned(), "view")
      const row = await screen.findByRole("button", { name: /Time Out Market/, expanded: false })
      expect(row).not.toHaveAttribute("aria-keyshortcuts")

      fireEvent.keyDown(row, { key: "ArrowDown", altKey: true })
      const first = within(screen.getByRole("region", { name: "Day 1 plan" })).getAllByRole("listitem")[0]!
      expect(first).toHaveTextContent("Time Out Market")
      expect(screen.queryByText(/moved down/)).toBeNull()
    })

    it("offers “Sort stops by time” only when timed stops are out of order", async () => {
      renderWorkspace(
        "/trips/lisbon/day/day-1",
        planned({
          days: [
            { id: "day-1", date: "2026-07-10", title: "Arrival", items: [fado, cash, market, unpinned] },
            { id: "day-2", date: "2026-07-11", items: [] },
          ],
        }),
      )
      const order = () =>
        within(screen.getByRole("region", { name: "Day 1 plan" }))
          .getAllByRole("listitem")
          .map((li) => li.querySelector("[id^='item-']")?.id)

      fireEvent.click(await screen.findByRole("button", { name: "More for day 1" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Sort stops by time" }))

      // Untimed items travel with the timed stop they followed.
      expect(order()).toEqual(["item-it-market", "item-it-cafe", "item-it-fado", "item-it-cash"])
      fireEvent.click(screen.getByRole("button", { name: "More for day 1" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Add day notes", "Clear this day"])
    })

    it("shows a compact trip header that links back to the overview", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      await screen.findByRole("textbox", { name: "Day title" })

      expect(screen.getByRole("link", { name: "Lisbon Long Weekend" })).toHaveAttribute("href", "/trips/lisbon")
      expect(screen.queryByRole("textbox", { name: "Trip name" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Improve with AI" })).toBeNull()
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument()
      expect(screen.getByText("Saved")).toBeInTheDocument()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
        "Improve whole trip with AI",
        "Trip details",
        "Duplicate trip",
        "Delete trip…",
      ])
    })

    it("switches between the itinerary and the map on a phone", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1")
      await screen.findByRole("textbox", { name: "Day title" })

      const tabs = within(screen.getByRole("tablist", { name: "View" }))
      expect(tabs.getByRole("tab", { name: "Itinerary" })).toHaveAttribute("aria-selected", "true")
      expect(tabs.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "false")
      expect(screen.queryByRole("region", { name: /^Map of day 1/ })).toBeNull()

      fireEvent.click(tabs.getByRole("tab", { name: "Map" }))
      expect(tabs.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true")
      expect(screen.getByRole("region", { name: "Map of day 1 with 2 pinned stops" })).toBeInTheDocument()

      fireEvent.click(tabs.getByRole("tab", { name: "Itinerary" }))
      expect(screen.queryByRole("region", { name: /^Map of day 1/ })).toBeNull()

      // Locating a stop from the list jumps to the map with its card open.
      fireEvent.click(screen.getByRole("button", { name: "Show Fado dinner on the map" }))
      expect(tabs.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true")
      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()

      // "Edit stop" comes back to the list with that stop's editor open.
      fireEvent.click(card.getByRole("button", { name: "Edit stop" }))
      expect(tabs.getByRole("tab", { name: "Itinerary" })).toHaveAttribute("aria-selected", "true")
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Fado dinner")
    })

    it("opens the stop named in the URL hash", async () => {
      renderWorkspace("/trips/lisbon/day/day-1#item-it-fado")
      const card = within(await screen.findByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()
    })

    it("adds a searched place as a pinned stop and saves it after the debounce", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWorkspace("/trips/lisbon/day/day-2")

      const input = await screen.findByRole("combobox", { name: "Add a place, note or booking" })
      expect(screen.getByText("Nothing planned yet")).toBeInTheDocument()
      fireEvent.change(input, { target: { value: "belem" } })

      const option = await screen.findByRole("option", { name: /Belém Tower/ })
      expect(option).toHaveTextContent("Avenida Brasília, Lisbon, Portugal")
      // The search is biased toward the trip.
      const [query, near] = mockSearchPlaces.mock.calls[0] as [string, { lat: number; lng: number }]
      expect(query).toBe("belem")
      expect(near.lat).toBeCloseTo(38.70875, 6)
      expect(near.lng).toBeCloseTo(-9.1381, 6)
      expect(screen.getByRole("option", { name: "Add “belem” without a pin" })).toBeInTheDocument()

      fireEvent.click(option)

      const marker = await screen.findByRole("button", { name: "Show Belém Tower on the map" })
      expect(marker).toHaveTextContent("1")
      expect(input).toHaveValue("")
      expect(screen.queryByText("Nothing planned yet")).toBeNull()
      expect(screen.getByRole("button", { name: "Pin 1: Belém Tower" })).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "Map of day 2 with 1 pinned stop" })).toBeInTheDocument()

      // Nothing is sent until the edit has settled.
      expect(mockUpdateTrip).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(mockUpdateTrip).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(mockUpdateTrip).toHaveBeenCalledTimes(1)
      const [, id, patch] = mockUpdateTrip.mock.calls[0] as [unknown, string, { days: TripDay[]; name: string }]
      expect(id).toBe("lisbon")
      expect(patch.name).toBe("Lisbon Long Weekend")
      expect(patch.days[0]!.items).toHaveLength(4)
      expect(patch.days[1]!.items).toEqual([
        {
          id: expect.stringMatching(/^it-[0-9a-f]{8}$/),
          kind: "place",
          title: "Belém Tower",
          status: "none",
          createdBy: "user",
          location: {
            name: "Belém Tower",
            address: "Avenida Brasília, Lisbon, Portugal",
            lat: 38.6916,
            lng: -9.2159,
            category: "palace",
            source: "user",
            confidence: "high",
          },
        },
      ])
      await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument())
    })

    it("adds typed text as a note without a pin", async () => {
      mockSearchPlaces.mockResolvedValue([])
      renderWorkspace("/trips/lisbon/day/day-2")

      const input = await screen.findByRole("combobox", { name: "Add a place, note or booking" })
      fireEvent.change(input, { target: { value: "Pack sunscreen" } })
      fireEvent.click(screen.getByRole("option", { name: "Add as a note" }))

      const plan = within(screen.getByRole("region", { name: "Day 2 plan" }))
      expect(await plan.findByText("Pack sunscreen")).toBeInTheDocument()
      expect(plan.queryByRole("button", { name: /on the map$/ })).toBeNull()
      expect(screen.getByRole("region", { name: "Map of day 2 with 0 pinned stops" })).toBeInTheDocument()
    })

    it("removes an item with an Undo that puts it back where it was", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const plan = () => within(screen.getByRole("region", { name: "Day 1 plan" }))
      const titles = () =>
        plan()
          .getAllByRole("listitem")
          .map((li) => within(li).getAllByRole("button", { expanded: false })[0]!.textContent)

      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))

      expect(plan().queryByText("Bring cash")).toBeNull()
      expect(plan().getAllByRole("listitem")).toHaveLength(3)
      const toast = screen.getByText("Removed “Bring cash”").closest('[role="status"]') as HTMLElement
      expect(toast).not.toBeNull()

      fireEvent.click(within(toast).getByRole("button", { name: "Undo" }))

      expect(plan().getAllByRole("listitem")).toHaveLength(4)
      expect(titles()[1]).toContain("Bring cash")
      expect(titles()[0]).toContain("Time Out Market")
      expect(screen.queryByText("Removed “Bring cash”")).toBeNull()
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
    })

    it("renumbers the markers when a pinned stop is removed", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: /Time Out Market/, expanded: false }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))

      expect(screen.queryByRole("button", { name: "Show Time Out Market on the map" })).toBeNull()
      expect(screen.getByRole("button", { name: "Show Fado dinner on the map" })).toHaveTextContent("1")
      expect(screen.getByRole("button", { name: "Pin 1: Fado dinner" })).toBeInTheDocument()
      expect(screen.getByText("Removed “Time Out Market”")).toBeInTheDocument()
    })

    it("says so when the day isn't on this trip", async () => {
      renderWorkspace("/trips/lisbon/day/day-99")

      const alert = await screen.findByRole("alert")
      expect(within(alert).getByRole("heading", { name: "That day isn’t on this trip" })).toBeInTheDocument()
      expect(within(alert).getByRole("link", { name: "Back to the overview" })).toHaveAttribute("href", "/trips/lisbon")
      expect(screen.queryByRole("combobox", { name: "Add a place, note or booking" })).toBeNull()
      // The map falls back to the whole trip.
      expect(screen.getByRole("region", { name: "Map of the whole trip with 1 pinned place" })).toBeInTheDocument()
    })
  })

  describe("view-only access", () => {
    it("hides editing controls on the overview", async () => {
      renderWorkspace("/trips/lisbon", planned(), "view")

      expect(await screen.findByRole("heading", { level: 1, name: "Lisbon Long Weekend" })).toBeInTheDocument()
      expect(screen.getByText("View only")).toBeInTheDocument()
      expect(screen.queryByRole("textbox", { name: "Trip name" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Improve with AI" })).toBeNull()
      expect(screen.queryByRole("button", { name: /Jul 10 – 11, 2026/ })).toBeNull()
      expect(screen.getByText("Jul 10 – 11, 2026 · 2 days")).toBeInTheDocument()
      expect(screen.queryByText("Saved")).toBeNull()
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Duplicate trip"])
      expect(within(screen.getByRole("region", { name: "Day by day" })).getByText("Nothing planned")).toBeInTheDocument()
    })

    it("hides editing controls on a day", async () => {
      renderWorkspace("/trips/lisbon/day/day-1", planned(), "view")

      expect(await screen.findByRole("heading", { level: 2, name: "Arrival" })).toBeInTheDocument()
      // The compact day header carries the trip name as a link, not the chip.
      expect(screen.getByRole("link", { name: "Lisbon Long Weekend" })).toHaveAttribute("href", "/trips/lisbon")
      expect(screen.queryByText("View only")).toBeNull()
      expect(screen.queryByText("Saved")).toBeNull()
      expect(screen.queryByRole("textbox", { name: "Day title" })).toBeNull()
      expect(screen.queryByRole("textbox", { name: "City for this day" })).toBeNull()
      expect(screen.queryByRole("combobox", { name: "Add a place, note or booking" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Ideas for this day" })).toBeNull()
      expect(screen.queryByRole("button", { name: /^More for day/ })).toBeNull()

      // Stops still open (read-only) and still locate on the map.
      fireEvent.click(screen.getByRole("button", { name: /Fado dinner/, expanded: false }))
      expect(screen.getByText("Confirmation FD-2291")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
      expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "Show Fado dinner on the map" }))
      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByText("Stop 2 of 2 · 8:00 PM")).toBeInTheDocument()
      expect(card.queryByRole("button", { name: "Edit stop" })).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Duplicate trip"])
      expect(mockUpdateTrip).not.toHaveBeenCalled()
    })

    it("lets an editor edit but not delete the trip", async () => {
      renderWorkspace("/trips/lisbon", planned(), "edit")
      expect(await screen.findByRole("textbox", { name: "Trip name" })).toBeInTheDocument()
      expect(screen.queryByText("View only")).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Trip details", "Duplicate trip"])
    })
  })

  describe("owner actions", () => {
    it("deletes the trip after confirming and returns to the list", async () => {
      mockDeleteTrip.mockResolvedValue({ ok: true })
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete trip…" }))
      const dialog = await screen.findByRole("dialog", { name: "Delete “Lisbon Long Weekend”?" })
      expect(mockDeleteTrip).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete trip" }))

      expect(await screen.findByText("All trips page")).toBeInTheDocument()
      expect(mockDeleteTrip.mock.calls[0]![1]).toBe("lisbon")
    })

    it("has no Delete for a trip shared with everyone", async () => {
      renderWorkspace("/trips/lisbon", planned({ sharedWithAllUsers: true }))
      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Trip details", "Duplicate trip"])
    })
  })

  describe("load failures", () => {
    it("renders the not-found page for a missing trip", async () => {
      mockGetTrip.mockRejectedValue(new Error("trip not found"))
      render(
        <MemoryRouter initialEntries={["/trips/nope"]}>
          <Routes>
            <Route path="/trips/:tripId" element={<TripWorkspace />} />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByRole("status", { name: "Loading trip" })).toBeInTheDocument()
      expect(await screen.findByRole("heading", { level: 1, name: "Here be dragons." })).toBeInTheDocument()
      expect(screen.getByText("404 · Off the map")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Back to all trips" })).toHaveAttribute("href", "/trips")
      expect(screen.queryByRole("region", { name: /^Map of/ })).toBeNull()
    })

    it("treats a forbidden trip the same way", async () => {
      mockGetTrip.mockRejectedValue(new Error("HTTP 403"))
      render(
        <MemoryRouter initialEntries={["/trips/secret"]}>
          <Routes>
            <Route path="/trips/:tripId" element={<TripWorkspace />} />
          </Routes>
        </MemoryRouter>,
      )
      expect(await screen.findByText("404 · Off the map")).toBeInTheDocument()
    })

    it("shows a retryable error for other failures", async () => {
      mockGetTrip.mockRejectedValue(new Error("Failed to fetch"))
      render(
        <MemoryRouter initialEntries={["/trips/lisbon"]}>
          <Routes>
            <Route path="/trips/:tripId" element={<TripWorkspace />} />
          </Routes>
        </MemoryRouter>,
      )
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn’t open this trip. Check your connection, then try again. (Failed to fetch)",
      )
      expect(screen.queryByText("404 · Off the map")).toBeNull()
    })
  })
})
