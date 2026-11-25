import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import type { PlaceResult } from "../geocode"
import type { AtlasMapProps } from "../map/AtlasMap"
import type { EnhanceTripResult } from "../tripsApi"
import type { EnhancementRun, RunQueueInfo, Trip, TripAccess, TripDay } from "../types"
import { HttpStatusError, PollTimeoutError } from "@/effect/errors"
import { makeItem, makeTrip, stubMatchMedia } from "./tripFixtures"
import { TripConflictError } from "../tripConflict"
import { emitTripChanged } from "../tripsEvents"

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
const mockListEnhancements = vi.fn()
const mockFollowEnhancement = vi.fn()
const mockGenerateItinerary = vi.fn()
const mockDeleteTrip = vi.fn()
const mockDuplicateTrip = vi.fn()
const mockApplySuggestions = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  enhanceTrip: (...args: unknown[]) => mockEnhanceTrip(...args),
  listEnhancements: (...args: unknown[]) => mockListEnhancements(...args),
  followEnhancement: (...args: unknown[]) => mockFollowEnhancement(...args),
  generateItinerary: (...args: unknown[]) => mockGenerateItinerary(...args),
  deleteTrip: (...args: unknown[]) => mockDeleteTrip(...args),
  duplicateTrip: (...args: unknown[]) => mockDuplicateTrip(...args),
  applySuggestions: (...args: unknown[]) => mockApplySuggestions(...args),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  leaveTrip: vi.fn(),
}))

const mockSearchPlaces = vi.fn()

vi.mock("../geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../geocode")>()),
  searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
  searchCities: vi.fn().mockResolvedValue([]),
  cityLabel: (city: { name: string }) => city.name,
}))

// The real map needs WebGL. The stub lists its pins as buttons that select
// the pin, and renders the overlay children (map chip, selected-place card).
// A dev build can always open the 3D view (it has a procedural ground);
// these tests describe a build without it.
vi.mock("../photoreal/available", () => ({ photorealAvailable: () => false }))

vi.mock("../map/AtlasMap", () => ({
  useIsDark: () => false,
  canRenderMap: () => false,
  AtlasMap: ({ pins, dots, routes, label, onSelect, ideaPins, onSelectIdea, frameKey, framePoints, children }: AtlasMapProps) => (
    <div role="region" aria-label={label} data-frame-key={frameKey} data-frame-points={JSON.stringify(framePoints ?? null)}>
      <p>{`${dots?.length ?? 0} dots, ${routes?.length ?? 0} routes`}</p>
      {pins.map((pin) => (
        <button key={pin.id} type="button" onClick={() => onSelect?.(pin.id)}>
          {`Pin ${pin.label}: ${pin.title}`}
        </button>
      ))}
      {ideaPins?.map((pin) => (
        <button key={pin.id} type="button" onClick={() => onSelectIdea?.(pin.id)}>
          {`Idea ${pin.variant}: ${pin.title}`}
        </button>
      ))}
      {children}
    </div>
  ),
}))

// The palette itself is tested elsewhere: keep what the workspace registers, to run it.
const registered = vi.hoisted(() => new Map<string, readonly Command[]>())
vi.mock("../command/CommandContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../command/CommandContext")>()),
  useRegisterCommands: (source: string, commands: readonly Command[]) => {
    registered.set(source, commands)
  },
}))

import type { Command } from "../command/commands"
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

/** Stands in for the browser's Back / a link elsewhere in the app. */
function Go({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to)}>
      Go elsewhere
    </button>
  )
}

function renderWithNav(path: string, to: string, trip: Trip | null = planned()) {
  if (trip) mockGetTrip.mockResolvedValue({ trip, access: "owner" })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Go to={to} />
      <Routes>
        <Route path="/trips/:tripId" element={<TripWorkspace />} />
        <Route path="/trips/:tripId/day/:dayId" element={<TripWorkspace />} />
      </Routes>
    </MemoryRouter>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const hotel = makeItem({
  id: "it-hotel",
  title: "Pestana Palace",
  location: { name: "Pestana Palace", lat: 38.7031, lng: -9.1853, category: "hotel", source: "ai" },
})

const reviewRun = { id: "run-1", tripId: "lisbon", scope: "trip", status: "complete", suggestions: [], appliedSuggestionIds: [], createdAt: "2026-07-01T00:00:00Z" }

/** The place card's eyebrow as one line of text: the lead, then the category on its own line. */
const eyebrow = (card: ReturnType<typeof within>) => card.getByText(/^Stop \d+ of \d+/).closest("p")
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
    mockListEnhancements.mockResolvedValue([])
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

      // Three stops (the note doesn't count), one of them still without a pin.
      expect(stat("Places")).toHaveTextContent("Places3")
      expect(stat("On the map")).toHaveTextContent("On the map2 of 3")
      expect(stat("Bookings")).toHaveTextContent("Bookings1")
      expect(screen.queryByText("Days", { selector: "dt" })).toBeNull()
      expect(screen.queryByText("Pinned", { selector: "dt" })).toBeNull()

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
      // The same word as the day's stop card, in a mono outline chip.
      expect(booking).toHaveTextContent("Booked")
      expect(booking).not.toHaveTextContent("Confirmed")

      // The rail links the overview and each day.
      const rail = within(screen.getByRole("navigation", { name: "Days" }))
      expect(rail.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
      expect(rail.getByRole("link", { name: /^Day 1, Friday, July 10, 4 items$/ })).toHaveAttribute("href", "/trips/lisbon/day/day-1")
      expect(rail.getByRole("link", { name: /^Day 2, .*0 items$/ })).not.toHaveAttribute("aria-current")
    })

    it("remembers the trip's accent under its address, for the boot screen of the next visit", async () => {
      localStorage.removeItem("trips-boot-accent")
      renderWorkspace("/trips/lisbon/day/day-1", planned({ appearance: { accent: "violet" } }))
      await screen.findByRole("navigation", { name: "Days" })
      expect(JSON.parse(localStorage.getItem("trips-boot-accent") ?? "null")).toEqual({ lisbon: "violet" })
    })

    it("opens the tab named in ?tab=, counts what is left to tick, and goes back to the itinerary", async () => {
      const trip = planned()
      trip.checklist = [
        { id: "c1", text: "Passport", done: false, group: "documents", createdAt: "2026-01-01T00:00:00Z" },
        { id: "c2", text: "Charger", done: true, group: "packing", createdAt: "2026-01-01T00:00:00Z" },
      ]
      renderWorkspace("/trips/lisbon?tab=checklist", trip)

      const tabs = within(await screen.findByRole("tablist", { name: "Trip overview" }))
      expect(tabs.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Itinerary", "Wishlist", "Budget", "Checklist1 1 left", "Essentials"])
      // The count is shown as "1" and read as "1 left".
      expect(tabs.getByRole("tab", { name: "Checklist 1 left" })).toHaveAttribute("aria-selected", "true")
      expect(await screen.findByRole("heading", { name: "Documents" })).toBeInTheDocument()
      expect(screen.queryByRole("region", { name: "Day by day" })).toBeNull()

      fireEvent.mouseDown(tabs.getByRole("tab", { name: "Itinerary" }), { button: 0 })
      expect(await screen.findByRole("region", { name: "Day by day" })).toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "Documents" })).toBeNull()
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
      // The chip counts places as the overview does, and how many are on the map.
      expect(map.getByText("All days · 3 of 4 places")).toBeInTheDocument()
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("leaves days with nothing pinned off the map", async () => {
      renderWorkspace("/trips/lisbon")
      const map = within(await screen.findByRole("region", { name: "Map of the whole trip with 1 pinned place" }))
      expect(map.getAllByRole("button").map((b) => b.textContent)).toEqual(["Pin 1: Day 1, Arrival: 2 pinned stops"])
      expect(map.getByText("2 dots, 0 routes")).toBeInTheDocument()
      expect(map.getByText("All days · 2 of 3 places")).toBeInTheDocument()
    })

    it("opens the day when its map pin is clicked", async () => {
      renderWorkspace("/trips/lisbon")
      fireEvent.click(await screen.findByRole("button", { name: "Pin 1: Day 1, Arrival: 2 pinned stops" }))

      expect(await screen.findByRole("textbox", { name: "Day title" })).toHaveValue("Arrival")
      expect(screen.getByRole("region", { name: "Map of day 1 with 2 pinned stops" })).toBeInTheDocument()
      // No place card on the way: the pin is a day, not a stop.
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()
    })

    it("shows a zero Bookings tile when nothing is booked, and city chips for multi-city trips", async () => {
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
      expect(stat("Places")).toHaveTextContent("Places2")
      expect(stat("On the map")).toHaveTextContent("On the map1 of 2")
      expect(stat("Bookings")).toHaveTextContent("Bookings0")
      // Nothing booked yet: the section is only the way to add one.
      expect(within(screen.getByRole("region", { name: "Bookings" })).getByRole("button", { name: /Add booking/ })).toBeInTheDocument()
      expect(stat("Walking")).toHaveTextContent("Walking–")
      expect(screen.queryByText("On foot")).toBeNull()

      const rows = within(screen.getByRole("region", { name: "Day by day" })).getAllByRole("link")
      expect(rows[0]).toHaveTextContent("Lisbon")
      expect(rows[1]).toHaveTextContent("Porto")
    })

    it("shows Days instead of “On the map” once every stop is pinned", async () => {
      renderWorkspace(
        "/trips/lisbon",
        planned({
          days: [
            { id: "day-1", date: "2026-07-10", title: "Arrival", items: [market, cash, fado] },
            { id: "day-2", date: "2026-07-11", items: [] },
          ],
        }),
      )

      await screen.findByRole("region", { name: "Day by day" })
      expect(stat("Places")).toHaveTextContent("Places2")
      expect(stat("Days")).toHaveTextContent("Days2")
      expect(screen.queryByText("On the map")).toBeNull()
      // ~1.4 km between the two pinned stops.
      expect(stat("Walking")).toHaveTextContent(/^Walking\d(\.\d)? km$/)
    })

    it("drafts an empty trip with AI from the overview", async () => {
      const empty = makeTrip()
      const drafted = planned()
      mockGenerateItinerary.mockResolvedValue({ trip: drafted, summary: "Drafted a food-first weekend.", incompleteDays: [] })
      renderWorkspace("/trips/lisbon", empty)

      expect(await screen.findByRole("heading", { name: "Let AI sketch all 2 days" })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "I’ll add stops myself" })).toHaveAttribute("href", "/trips/lisbon/day/day-1")
      fireEvent.click(screen.getByRole("radio", { name: "Packed" }))
      fireEvent.click(screen.getByRole("button", { name: "Coffee" }))
      fireEvent.click(screen.getByRole("button", { name: "Draft itinerary" }))

      await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
      expect(mockGenerateItinerary.mock.calls[0]!.slice(1, 3)).toEqual([
        "lisbon",
        { prompt: undefined, preferences: { pace: "packed", interests: "Coffee" }, replaceExisting: false },
      ])
      expect(mockGenerateItinerary.mock.calls[0]![3]).toBeInstanceOf(AbortSignal)

      // The drafted trip replaces the empty one and the summary is announced.
      expect((await screen.findAllByText("Drafted a food-first weekend."))[0]).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Draft itinerary" })).toBeNull()
      expect(stat("Places")).toHaveTextContent("Places3")
      expect(stat("On the map")).toHaveTextContent("On the map2 of 3")
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeInTheDocument()
    })

    it("says which days still need work when a draft comes back partial", async () => {
      mockGenerateItinerary.mockResolvedValue({ trip: planned(), summary: "Drafted.", incompleteDays: [2] })
      renderWorkspace("/trips/lisbon", makeTrip())

      fireEvent.click(await screen.findByRole("button", { name: "Draft itinerary" }))
      expect(await screen.findByText(/but not every day\. Day 2 needs another go/)).toBeInTheDocument()
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

      const title = await screen.findByRole("textbox", { name: "Day title" })
      expect(title).toHaveValue("Arrival")
      expect(title.closest("header")).toHaveTextContent(/Day 1 of 2 · Friday, July 10/)

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
      // Counted as the day header counts: stops, and how many of them have a pin.
      expect(map.getByText("Day 1 · Lisbon · 2 of 3 stops")).toBeInTheDocument()

      expect(within(screen.getByRole("navigation", { name: "Days" })).getByRole("link", { name: /^Day 1,/ })).toHaveAttribute(
        "aria-current",
        "page",
      )
      expect(within(screen.getByRole("navigation", { name: "Other days" })).getByRole("link")).toHaveAttribute(
        "href",
        "/trips/lisbon/day/day-2",
      )
    })

    it("says an empty day has nothing planned once, rather than counting zero", async () => {
      renderWorkspace("/trips/lisbon/day/day-2")
      expect(await screen.findByText("Nothing planned yet")).toBeInTheDocument()
      expect(screen.queryByText("Nothing planned")).toBeNull()
      expect(screen.queryByText(/0 stops/)).toBeNull()
    })

    it("marks the later of two overlapping stops in the list", async () => {
      const tour = makeItem({ id: "it-tour", title: "Tile museum", time: "12:00", endTime: "13:30" })
      renderWorkspace("/trips/lisbon/day/day-1", planned({ days: [{ id: "day-1", date: "2026-07-10", items: [market, tour] }] }))

      const plan = within(await screen.findByRole("region", { name: "Day 1 plan" }))
      const warning = plan.getByText("Overlaps Tile museum")
      expect(warning.closest("[id^='item-']")).toHaveAttribute("id", "item-it-market")
      expect(plan.getAllByText(/^Overlaps /)).toHaveLength(1)
    })

    it("shows the selected-place card when a marker is clicked", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Show Time Out Market on the map" }))

      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Time Out Market" })).toBeInTheDocument()
      expect(eyebrow(card)).toHaveTextContent(/^Stop 1 of 2 · 12:30 PM Market$/)
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
      expect(eyebrow(card)).toHaveTextContent(/^Stop 2 of 2 · 8:00 PM$/)

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
      expect(eyebrow(card())).toHaveTextContent(/^Stop 2 of 2 · 8:00 PM$/)
      expect(card().getByRole("button", { name: "Next stop" })).toBeDisabled()

      fireEvent.click(card().getByRole("button", { name: "Previous stop" }))
      expect(card().getByRole("heading", { name: "Time Out Market" })).toBeInTheDocument()
      expect(eyebrow(card())).toHaveTextContent(/^Stop 1 of 2 · 12:30 PM Market$/)
    })

    it("has no stepper when the day has a single pinned stop", async () => {
      renderWorkspace(
        "/trips/lisbon/day/day-1",
        planned({ days: [{ id: "day-1", date: "2026-07-10", items: [market, cash] }, { id: "day-2", date: "2026-07-11", items: [] }] }),
      )
      fireEvent.click(await screen.findByRole("button", { name: "Show Time Out Market on the map" }))

      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(eyebrow(card)).toHaveTextContent(/^Stop 1 of 1 · 12:30 PM Market$/)
      expect(card.queryByRole("button", { name: "Previous stop" })).toBeNull()
      expect(card.queryByRole("button", { name: "Next stop" })).toBeNull()
    })

    it("opens the stop's editor from the place card", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const row = await screen.findByRole("button", { name: /^(?!More for).*Time Out Market/, expanded: false })
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
          .flatMap((li) => li.querySelector("[id^='item-']")?.id ?? [])
      const row = (name: RegExp) => plan().getByRole("button", { name: new RegExp(`^(?!More for).*${name.source}`), expanded: false })

      await screen.findByRole("textbox", { name: "Day title" })
      expect(order()).toEqual(["item-it-market", "item-it-cash", "item-it-cafe", "item-it-fado"])
      expect(row(/Time Out Market/)).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown")

      fireEvent.keyDown(row(/Time Out Market/), { key: "ArrowDown", altKey: true })
      expect(order()).toEqual(["item-it-cash", "item-it-market", "item-it-cafe", "item-it-fado"])
      expect(screen.getByText("Time Out Market moved down, now 2 of 4.")).toHaveAttribute("aria-live", "polite")

      expect(plan().queryByRole("heading", { name: "Anytime" })).toBeNull()
      fireEvent.keyDown(row(/Fado dinner/), { key: "ArrowUp", altKey: true })
      expect(order()).toEqual(["item-it-cash", "item-it-market", "item-it-fado", "item-it-cafe"])
      expect(screen.getByText("Fado dinner moved up, now 3 of 4.")).toBeInTheDocument()
      // The untimed cafe now follows the last timed stop: it waits under Anytime.
      expect(plan().getByRole("heading", { name: "Anytime" })).toBeInTheDocument()
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
      const row = await screen.findByRole("button", { name: /^(?!More for).*Time Out Market/, expanded: false })
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
      const after = screen.getAllByRole("menuitem").map((item) => item.textContent)
      expect(after).toEqual(expect.arrayContaining(["Add day notes", "Export to calendar", "Clear this day"]))
      expect(after).not.toContain("Sort stops by time")
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
        "Add places from Instagram",
        "Trip details",
        "Export to calendar",
        "Print itinerary",
        "Trip recap",
        "Copy itinerary",
        "Duplicate trip",
        "Delete trip…",
      ])
    })

    it("switches between the itinerary and the map on a phone", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1")
      await screen.findByRole("textbox", { name: "Day title" })

      const views = within(screen.getByRole("radiogroup", { name: "View" }))
      expect(views.getByRole("radio", { name: "Itinerary" })).toHaveAttribute("aria-checked", "true")
      expect(views.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "false")
      expect(screen.queryByRole("region", { name: /^Map of day 1/ })).toBeNull()

      fireEvent.click(views.getByRole("radio", { name: "Map" }))
      expect(views.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true")
      expect(screen.getByRole("region", { name: "Map of day 1 with 2 pinned stops" })).toBeInTheDocument()

      fireEvent.click(views.getByRole("radio", { name: "Itinerary" }))
      expect(screen.queryByRole("region", { name: /^Map of day 1/ })).toBeNull()
      // Hidden, not torn down: MapLibre is costly to build again.
      expect(screen.getByRole("region", { name: /^Map of day 1/, hidden: true })).toBeInTheDocument()

      // Locating a stop from the list jumps to the map with its card open.
      fireEvent.click(screen.getByRole("button", { name: "Show Fado dinner on the map" }))
      expect(views.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true")
      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()

      // "Edit stop" comes back to the list with that stop's editor open.
      fireEvent.click(card.getByRole("button", { name: "Edit stop" }))
      expect(views.getByRole("radio", { name: "Itinerary" })).toHaveAttribute("aria-checked", "true")
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Fado dinner")
    })

    it("opens the stop named in the URL hash", async () => {
      renderWorkspace("/trips/lisbon/day/day-1#item-it-fado")
      const card = within(await screen.findByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()
    })

    it("shows the stop named in the URL hash on the map on a phone", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1#item-it-fado")
      const card = within(await screen.findByRole("complementary", { name: "Selected place" }))
      expect(card.getByRole("heading", { name: "Fado dinner" })).toBeInTheDocument()
      expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true")
    })

    it("picks out the stop named by #stop- in the list on a phone", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1#stop-it-fado")
      await screen.findByRole("textbox", { name: "Day title" })
      expect(screen.getByRole("radio", { name: "Itinerary" })).toHaveAttribute("aria-checked", "true")
    })

    it("leaves the day alone when an arrow key moves the Itinerary / Map choice", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1")
      await screen.findByRole("textbox", { name: "Day title" })
      fireEvent.keyDown(screen.getByRole("radio", { name: "Itinerary" }), { key: "ArrowRight" })
      expect(screen.getByRole("textbox", { name: "Day title" })).toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: /day 2/i })).not.toBeInTheDocument()
    })

    it("moves the Itinerary / Map choice with the arrow keys", async () => {
      stubMatchMedia(false)
      renderWorkspace("/trips/lisbon/day/day-1")
      await screen.findByRole("textbox", { name: "Day title" })
      const list = screen.getByRole("radio", { name: "Itinerary" })
      const map = screen.getByRole("radio", { name: "Map" })
      expect(list).toHaveAttribute("tabindex", "0")
      expect(map).toHaveAttribute("tabindex", "-1")

      fireEvent.keyDown(list, { key: "ArrowRight" })
      expect(map).toHaveAttribute("aria-checked", "true")
      expect(map).toHaveFocus()
      expect(map).toHaveAttribute("tabindex", "0")
      fireEvent.keyDown(map, { key: "ArrowLeft" })
      expect(list).toHaveAttribute("aria-checked", "true")
      expect(list).toHaveFocus()
    })

    it("adds a searched place as a pinned stop and saves it after the debounce", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWorkspace("/trips/lisbon/day/day-2")

      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
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

    it("offers to rework the plan when a hotel is added, and runs a whole-trip review on yes", async () => {
      const hotel: PlaceResult = { id: "W9", name: "Pestana Palace", context: "Rua Jau, Lisbon", address: "Rua Jau, Lisbon", lat: 38.7031, lng: -9.1853, category: "hotel" }
      mockSearchPlaces.mockResolvedValue([hotel])
      mockEnhanceTrip.mockResolvedValue({
        run: { id: "run-1", tripId: "lisbon", scope: "trip", status: "complete", suggestions: [], appliedSuggestionIds: [], createdAt: "2026-07-01T00:00:00Z" },
        applied: [],
      })
      renderWorkspace("/trips/lisbon/day/day-2")

      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      // Nothing is offered for the trip as it was opened.
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
      fireEvent.change(input, { target: { value: "pestana" } })
      fireEvent.click(await screen.findByRole("option", { name: /Pestana Palace/ }))

      expect(await screen.findByText("Staying at Pestana Palace. Rework the plan around it?")).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Adjust plan" }))

      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))
      const [, id, scope, dayId, prompt] = mockEnhanceTrip.mock.calls[0] as [unknown, string, string, string | undefined, string]
      expect([id, scope, dayId]).toEqual(["lisbon", "trip", undefined])
      expect(prompt).toContain("staying at Pestana Palace")
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
    })

    it("does not offer a rework again when the same hotel comes back by undo, redo or clearing the day", async () => {
      mockSearchPlaces.mockResolvedValue([{ id: "W9", name: "Pestana Palace", context: "Lisbon", address: "Lisbon", lat: 38.7031, lng: -9.1853, category: "hotel" }])
      renderWorkspace("/trips/lisbon/day/day-2")
      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      fireEvent.change(input, { target: { value: "pestana" } })
      fireEvent.click(await screen.findByRole("option", { name: /Pestana Palace/ }))
      fireEvent.click(await screen.findByRole("button", { name: "Not now" }))

      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true })
      await waitFor(() => expect(screen.queryByRole("button", { name: "Show Pestana Palace on the map" })).toBeNull())
      fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true })
      await screen.findByRole("button", { name: "Show Pestana Palace on the map" })
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "More for day 2" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Clear this day" }))
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Clear day 2?" })).getByRole("button", { name: "Clear day" }))
      const toast = (await screen.findByText("Cleared day 2")).closest('[role="status"]') as HTMLElement
      fireEvent.click(within(toast).getByRole("button", { name: "Undo" }))
      await screen.findByRole("button", { name: "Show Pestana Palace on the map" })
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
    })

    it("does not offer a rework for an ordinary stop, and “Not now” dismisses the offer", async () => {
      renderWorkspace("/trips/lisbon/day/day-2")
      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      fireEvent.change(input, { target: { value: "belem" } })
      fireEvent.click(await screen.findByRole("option", { name: /Belém Tower/ }))
      await screen.findByRole("button", { name: "Show Belém Tower on the map" })
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()

      mockSearchPlaces.mockResolvedValue([{ id: "W9", name: "Pestana Palace", context: "Lisbon", address: "Lisbon", lat: 38.7031, lng: -9.1853, category: "hotel" }])
      fireEvent.change(input, { target: { value: "pestana" } })
      fireEvent.click(await screen.findByRole("option", { name: /Pestana Palace/ }))
      fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
      expect(mockEnhanceTrip).not.toHaveBeenCalled()
    })

    it("waits for the search when Enter is pressed before results arrive", async () => {
      let answer: (places: PlaceResult[]) => void = () => {}
      mockSearchPlaces.mockImplementation(() => new Promise<PlaceResult[]>((resolve) => (answer = resolve)))
      renderWorkspace("/trips/lisbon/day/day-2")
      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      fireEvent.change(input, { target: { value: "belem" } })
      fireEvent.keyDown(input, { key: "Enter" })
      // Not added "without a pin" while the search is out.
      expect(screen.getByText("Nothing planned yet")).toBeInTheDocument()

      await waitFor(() => expect(mockSearchPlaces).toHaveBeenCalled())
      await act(async () => answer([belem]))
      expect(await screen.findByRole("button", { name: "Show Belém Tower on the map" })).toBeInTheDocument()
    })

    it("keeps an arrowed-to option highlighted when results arrive", async () => {
      let answer: (places: PlaceResult[]) => void = () => {}
      mockSearchPlaces.mockImplementation(() => new Promise<PlaceResult[]>((resolve) => (answer = resolve)))
      renderWorkspace("/trips/lisbon/day/day-2")
      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      fireEvent.change(input, { target: { value: "belem" } })
      fireEvent.keyDown(input, { key: "ArrowDown" })
      expect(screen.getByRole("option", { name: "Add as a note" })).toHaveAttribute("aria-selected", "true")

      await waitFor(() => expect(mockSearchPlaces).toHaveBeenCalled())
      await act(async () => answer([belem]))
      await screen.findByRole("option", { name: /Belém Tower/ })
      expect(screen.getByRole("option", { name: "Add as a note" })).toHaveAttribute("aria-selected", "true")
      fireEvent.keyDown(input, { key: "Enter" })
      const plan = within(screen.getByRole("region", { name: "Day 2 plan" }))
      expect(await plan.findByText("belem")).toBeInTheDocument()
      expect(plan.queryByRole("button", { name: /on the map$/ })).toBeNull()
    })

    it("adds typed text as a note without a pin", async () => {
      mockSearchPlaces.mockResolvedValue([])
      renderWorkspace("/trips/lisbon/day/day-2")

      const input = await screen.findByRole("combobox", { name: "Add a place, note or link" })
      fireEvent.change(input, { target: { value: "Pack sunscreen" } })
      fireEvent.click(screen.getByRole("option", { name: "Add as a note" }))

      const plan = within(screen.getByRole("region", { name: "Day 2 plan" }))
      expect(await plan.findByText("Pack sunscreen")).toBeInTheDocument()
      expect(plan.queryByRole("button", { name: /on the map$/ })).toBeNull()
      expect(screen.getByRole("region", { name: "Map of day 2 with 0 pinned stops" })).toBeInTheDocument()
    })

    describe("stop times", () => {
      const openMarket = async () => {
        const row = await screen.findByRole("button", { name: /^(?!More for).*Time Out Market/, expanded: false })
        fireEvent.click(row)
        return row
      }
      // The error message sits inside the <label>, so it joins the field's name while shown.
      const starts = () => screen.getByRole("textbox", { name: /^Starts/ })

      it("shows the start time as text and hides Ends until it is asked for", async () => {
        await (renderWorkspace("/trips/lisbon/day/day-1"), openMarket())

        expect(starts()).toHaveValue("12:30 PM")
        expect(starts()).toHaveAttribute("placeholder", "e.g. 9:30 AM")
        expect(screen.queryByRole("textbox", { name: "Ends" })).toBeNull()
        expect(screen.getByRole("button", { name: "Add end time" })).toBeInTheDocument()
      })

      it("commits a loosely typed time on blur and saves it as HH:MM", async () => {
        renderWorkspace("/trips/lisbon/day/day-1")
        const row = await openMarket()

        fireEvent.change(starts(), { target: { value: "2 pm" } })
        // Nothing changes while typing.
        expect(row).toHaveTextContent("12:30 PM")
        fireEvent.blur(starts())

        expect(starts()).toHaveValue("2:00 PM")
        expect(row).toHaveTextContent("2:00 PM")
        expect(row).not.toHaveTextContent("12:30 PM")
        expect(screen.queryByRole("alert")).toBeNull()

        await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1), { timeout: 3000 })
        const patch = mockUpdateTrip.mock.calls[0]![2] as { days: TripDay[] }
        expect(patch.days[0]!.items[0]).toMatchObject({ id: "it-market", time: "14:00" })
      })

      it("commits on Enter", async () => {
        renderWorkspace("/trips/lisbon/day/day-1")
        const row = await openMarket()

        fireEvent.change(starts(), { target: { value: "830" } })
        fireEvent.keyDown(starts(), { key: "Enter" })
        expect(starts()).toHaveValue("8:30 AM")
        expect(row).toHaveTextContent("8:30 AM")
      })

      it("rejects text that isn't a time and keeps the old one", async () => {
        renderWorkspace("/trips/lisbon/day/day-1")
        const row = await openMarket()

        fireEvent.change(starts(), { target: { value: "after lunch" } })
        fireEvent.blur(starts())

        expect(screen.getByRole("alert")).toHaveTextContent("Try a time like 9:30 AM or 14:00.")
        expect(starts()).toHaveAttribute("aria-invalid", "true")
        expect(starts()).toHaveValue("after lunch")
        expect(row).toHaveTextContent("12:30 PM")

        // Fixing it clears the error.
        fireEvent.change(starts(), { target: { value: "13:15" } })
        fireEvent.blur(starts())
        expect(screen.queryByRole("alert")).toBeNull()
        expect(starts()).not.toHaveAttribute("aria-invalid")
        expect(starts()).toHaveValue("1:15 PM")
        expect(row).toHaveTextContent("1:15 PM")
      })

      it("removes the time when the field is cleared", async () => {
        renderWorkspace("/trips/lisbon/day/day-1")
        const row = await openMarket()

        fireEvent.change(starts(), { target: { value: "  " } })
        fireEvent.blur(starts())

        expect(row).not.toHaveTextContent("12:30 PM")
        expect(starts()).toHaveValue("")
        expect(screen.queryByRole("alert")).toBeNull()
      })

      it("adds an end time on request and takes the field away again when it is cleared", async () => {
        renderWorkspace("/trips/lisbon/day/day-1")
        const row = await openMarket()

        fireEvent.click(screen.getByRole("button", { name: "Add end time" }))
        const ends = () => screen.getByRole("textbox", { name: "Ends" })
        expect(ends()).toHaveValue("")
        expect(ends()).toHaveFocus()
        expect(screen.queryByRole("button", { name: "Add end time" })).toBeNull()

        fireEvent.change(ends(), { target: { value: "1:45pm" } })
        fireEvent.keyDown(ends(), { key: "Enter" })
        expect(ends()).toHaveValue("1:45 PM")
        expect(row).toHaveTextContent("12:30 PM")
        expect(row).toHaveTextContent("1:45 PM")

        fireEvent.change(ends(), { target: { value: "" } })
        fireEvent.blur(ends())
        expect(screen.queryByRole("textbox", { name: "Ends" })).toBeNull()
        expect(screen.getByRole("button", { name: "Add end time" })).toBeInTheDocument()
        expect(row).not.toHaveTextContent("1:45 PM")
      })

      it("shows Ends straight away for a stop that already has an end time", async () => {
        renderWorkspace(
          "/trips/lisbon/day/day-1",
          planned({
            days: [
              { id: "day-1", date: "2026-07-10", items: [{ ...market, endTime: "14:00" }] },
              { id: "day-2", date: "2026-07-11", items: [] },
            ],
          }),
        )
        const row = await openMarket()
        expect(row).toHaveTextContent("12:30 PM")
        expect(row).toHaveTextContent("2:00 PM")
        expect(screen.getByRole("textbox", { name: "Ends" })).toHaveValue("2:00 PM")
        expect(screen.queryByRole("button", { name: "Add end time" })).toBeNull()
      })
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
      fireEvent.click(await screen.findByRole("button", { name: /^(?!More for).*Time Out Market/, expanded: false }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))

      expect(screen.queryByRole("button", { name: "Show Time Out Market on the map" })).toBeNull()
      expect(screen.getByRole("button", { name: "Show Fado dinner on the map" })).toHaveTextContent("1")
      expect(screen.getByRole("button", { name: "Pin 1: Fado dinner" })).toBeInTheDocument()
      expect(screen.getByText("Removed “Time Out Market”")).toBeInTheDocument()
    })

    it("moves focus to the next stop after a delete", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
      expect(document.activeElement).toHaveTextContent("Mystery cafe")
    })

    it("undoes with Cmd/Ctrl+Z and redoes with Shift, but leaves a text field's own undo alone", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const plan = () => within(screen.getByRole("region", { name: "Day 1 plan" }))
      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
      expect(plan().queryByText("Bring cash")).toBeNull()

      fireEvent.keyDown(screen.getByRole("textbox", { name: "Day title" }), { key: "z", metaKey: true })
      expect(plan().queryByText("Bring cash")).toBeNull()

      fireEvent.keyDown(document.body, { key: "z", metaKey: true })
      expect(plan().getByText("Bring cash")).toBeInTheDocument()
      expect(screen.getByText("Undone: Removed “Bring cash”")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()

      fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true })
      expect(plan().queryByText("Bring cash")).toBeNull()
      expect(screen.getByText("Redone: Removed “Bring cash”")).toBeInTheDocument()
    })

    it("offers Undo after clearing a day", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "More for day 1" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Clear this day" }))
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Clear day 1?" })).getByRole("button", { name: "Clear day" }))
      expect(await screen.findByText("Nothing planned yet")).toBeInTheDocument()

      const toast = screen.getByText("Cleared day 1").closest('[role="status"]') as HTMLElement
      fireEvent.click(within(toast).getByRole("button", { name: "Undo" }))
      expect(within(screen.getByRole("region", { name: "Day 1 plan" })).getAllByRole("listitem")).toHaveLength(4)
    })

    it("keeps the Undo toast for 12 seconds, and while the pointer is on it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
      const toast = () => screen.queryByText("Removed “Bring cash”")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000)
      })
      expect(toast()).toBeInTheDocument()
      fireEvent.mouseEnter(toast()!.closest('[role="status"]')!)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(toast()).toBeInTheDocument()
      fireEvent.mouseLeave(toast()!.closest('[role="status"]')!)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_500)
      })
      expect(toast()).toBeNull()
    })

    it("says so when the day isn't on this trip", async () => {
      renderWorkspace("/trips/lisbon/day/day-99")

      const alert = await screen.findByRole("alert")
      expect(within(alert).getByRole("heading", { name: "That day isn’t on this trip" })).toBeInTheDocument()
      expect(within(alert).getByRole("link", { name: "Back to the overview" })).toHaveAttribute("href", "/trips/lisbon")
      expect(screen.queryByRole("combobox", { name: "Add a place, note or link" })).toBeNull()
      // The map falls back to the whole trip.
      expect(screen.getByRole("region", { name: "Map of the whole trip with 1 pinned place" })).toBeInTheDocument()
    })
  })

  describe("wishlist places on the map", () => {
    const ideas = [
      makeItem({ id: "idea-pasteis", title: "Pastéis de Belém", location: { name: "Pastéis de Belém", lat: 38.6975, lng: -9.2032, source: "user" } }),
      makeItem({ id: "idea-unpinned", title: "That bar Sam mentioned" }),
      makeItem({ id: "idea-lx", title: "LX Factory", location: { name: "LX Factory", lat: 38.7033, lng: -9.1786, source: "user" } }),
    ]

    /** The map's frame, as the stub saw it. */
    const frameOf = (map: HTMLElement) => [map.dataset.frameKey, map.dataset.framePoints]

    /** Where the router is: the stand-in for the address bar. */
    function Address() {
      const location = useLocation()
      return <output aria-label="Address">{location.pathname + location.search}</output>
    }

    function Back() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      )
    }

    it("pins located ideas apart from the stops: the frame, the stop count and the chip stay as they were", async () => {
      const { unmount } = renderWorkspace("/trips/lisbon")
      const plain = await screen.findByRole("region", { name: "Map of the whole trip with 1 pinned place" })
      const before = { frame: frameOf(plain), chip: within(plain).getByText(/^All days/).textContent }
      unmount()

      renderWorkspace("/trips/lisbon", planned({ ideas }))
      // The stop wording is unchanged; AtlasMap itself adds "and 2 wishlist places" while they show.
      const map = await screen.findByRole("region", { name: "Map of the whole trip with 1 pinned place" })
      expect(within(map).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Pin 1: Day 1, Arrival: 2 pinned stops",
        "Idea idea: Pastéis de Belém",
        "Idea idea: LX Factory",
      ])
      expect(frameOf(map)).toEqual(before.frame)
      expect(within(map).getByText(/^All days/).textContent).toBe(before.chip)
    })

    it("shows them on a day too, without touching the day's stops, chip or frame", async () => {
      const { unmount } = renderWorkspace("/trips/lisbon/day/day-1")
      const plain = await screen.findByRole("region", { name: "Map of day 1 with 2 pinned stops" })
      const before = { frame: frameOf(plain), chip: within(plain).getByText(/^Day 1/).textContent }
      unmount()

      renderWorkspace("/trips/lisbon/day/day-1", planned({ ideas }))
      const map = await screen.findByRole("region", { name: "Map of day 1 with 2 pinned stops" })
      expect(within(map).getAllByRole("button", { name: /^Pin / }).map((b) => b.textContent)).toEqual([
        "Pin 1: Time Out Market",
        "Pin 2: Fado dinner",
      ])
      expect(within(map).getAllByRole("button", { name: /^Idea / })).toHaveLength(2)
      expect(frameOf(map)).toEqual(before.frame)
      expect(within(map).getByText(/^Day 1/).textContent).toBe(before.chip)
    })

    it("opens the idea from its pin through the address, and Back closes it", async () => {
      mockGetTrip.mockResolvedValue({ trip: planned({ ideas }), access: "owner" })
      render(
        <MemoryRouter initialEntries={["/trips/lisbon/day/day-1?tab=plan"]}>
          <Address />
          <Back />
          <Routes>
            <Route path="/trips/:tripId/day/:dayId" element={<TripWorkspace />} />
          </Routes>
        </MemoryRouter>,
      )
      fireEvent.click(await screen.findByRole("button", { name: "Idea idea: LX Factory" }))
      expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("/trips/lisbon/day/day-1?tab=plan&idea=idea-lx")
      // Picking a wishlist place is not picking a stop.
      expect(screen.queryByRole("complementary", { name: "Selected place" })).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "Back" }))
      expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent(/^\/trips\/lisbon\/day\/day-1\?tab=plan$/)
    })

    describe("a tab from the command palette", () => {
      const runCommand = (id: string) => act(() => registered.get("trip")!.find((command) => command.id === id)!.run())
      // An open place's sheet hides the rest of the page from the accessibility
      // tree (names and all) once its chunk has loaded: find these by label and text.
      const address = () => screen.getByLabelText("Address")
      const back = () => fireEvent.click(screen.getByText("Back"))
      function renderAt(path: string) {
        mockGetTrip.mockResolvedValue({ trip: planned({ ideas }), access: "owner" })
        render(
          <MemoryRouter initialEntries={["/trips", path]} initialIndex={1}>
            <Address />
            <Back />
            <Routes>
              <Route path="/trips/:tripId" element={<TripWorkspace />} />
              <Route path="/trips/:tripId/day/:dayId" element={<TripWorkspace />} />
              <Route path="/trips" element={<p>All trips page</p>} />
            </Routes>
          </MemoryRouter>,
        )
      }

      it("changes the tab on the overview as the tab bar does: an open place closes with it, and Back leaves the trip", async () => {
        renderAt("/trips/lisbon?tab=wishlist")
        fireEvent.click(await screen.findByRole("button", { name: "Idea idea: LX Factory" }))
        expect(address()).toHaveTextContent("/trips/lisbon?tab=wishlist&idea=idea-lx")
        runCommand("trip:tab-budget")
        expect(address()).toHaveTextContent(/^\/trips\/lisbon\?tab=budget$/)
        back()
        expect(screen.getByText("All trips page")).toBeInTheDocument()
      })

      it("goes from a day to that tab of the overview as a new entry, like any link off the day", async () => {
        renderAt("/trips/lisbon/day/day-1")
        await screen.findByRole("button", { name: "Idea idea: LX Factory" })
        runCommand("trip:tab-budget")
        expect(address()).toHaveTextContent(/^\/trips\/lisbon\?tab=budget$/)
        back()
        expect(address()).toHaveTextContent(/^\/trips\/lisbon\/day\/day-1$/)
      })
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
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Export to calendar", "Print itinerary", "Trip recap", "Copy itinerary", "Duplicate trip"])
      expect(within(screen.getByRole("region", { name: "Day by day" })).getByText("Nothing planned")).toBeInTheDocument()
    })

    it("copies the itinerary as text and says so", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
      renderWorkspace("/trips/lisbon")
      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy itinerary" }))

      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
      expect(writeText.mock.calls[0]![0]).toContain("Lisbon Long Weekend")
      expect(await screen.findAllByText("Itinerary copied")).not.toHaveLength(0)
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
      expect(screen.queryByRole("combobox", { name: "Add a place, note or link" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Ideas for this day" })).toBeNull()
      // A viewer's day menu only exports.
      fireEvent.click(screen.getByRole("button", { name: /^More for day/ }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Export to calendar"])
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })

      // Stops still open (read-only) and still locate on the map.
      fireEvent.click(screen.getByRole("button", { name: /Fado dinner/, expanded: false }))
      expect(screen.getAllByText("FD-2291").length).toBeGreaterThan(0)
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
      expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "Show Fado dinner on the map" }))
      const card = within(screen.getByRole("complementary", { name: "Selected place" }))
      expect(eyebrow(card)).toHaveTextContent(/^Stop 2 of 2 · 8:00 PM$/)
      expect(card.queryByRole("button", { name: "Edit stop" })).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Export to calendar", "Print itinerary", "Trip recap", "Copy itinerary", "Duplicate trip"])
      expect(mockUpdateTrip).not.toHaveBeenCalled()
    })

    it("lets an editor edit but not delete the trip", async () => {
      renderWorkspace("/trips/lisbon", planned(), "edit")
      expect(await screen.findByRole("textbox", { name: "Trip name" })).toBeInTheDocument()
      expect(screen.queryByText("View only")).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Add places from Instagram", "Trip details", "Export to calendar", "Print itinerary", "Trip recap", "Copy itinerary", "Duplicate trip"])
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

    it("opens the trip recap from the menu, and closes it", async () => {
      renderWorkspace("/trips/lisbon")
      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Trip recap" }))
      const dialog = await screen.findByRole("dialog", { name: "Lisbon Long Weekend" })
      fireEvent.keyDown(dialog, { key: "Escape" })
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lisbon Long Weekend" })).not.toBeInTheDocument())
    })

    it("has no Delete for a trip shared with everyone", async () => {
      renderWorkspace("/trips/lisbon", planned({ sharedWithAllUsers: true }))
      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Add places from Instagram", "Trip details", "Export to calendar", "Print itinerary", "Trip recap", "Copy itinerary", "Duplicate trip"])
    })
  })

  describe("state that belongs to one trip, one day, one run", () => {
    it("drops a draft that lands after the traveller has moved to another trip", async () => {
      const draft = deferred<{ trip: Trip; summary: string; incompleteDays: number[] }>()
      mockGenerateItinerary.mockReturnValue(draft.promise)
      const porto = planned({ id: "porto", name: "Porto Days" })
      mockGetTrip.mockImplementation(async (_getToken: unknown, id: string) => ({ trip: id === "porto" ? porto : makeTrip(), access: "owner" }))
      renderWithNav("/trips/lisbon", "/trips/porto", null)

      fireEvent.click(await screen.findByRole("button", { name: "Draft itinerary" }))
      await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getByRole("button", { name: "Go elsewhere" }))
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Trip name" })).toHaveValue("Porto Days"))
      // A fresh workspace: nothing is locked by the other trip's run.
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeEnabled()

      await act(async () => {
        draft.resolve({ trip: planned({ name: "Lisbon, drafted" }), summary: "Drafted a food-first weekend.", incompleteDays: [] })
      })
      expect(screen.getByRole("textbox", { name: "Trip name" })).toHaveValue("Porto Days")
      expect(screen.queryByText("Drafted a food-first weekend.")).toBeNull()
    })

    it("keeps the same workspace when only the day changes", async () => {
      renderWithNav("/trips/lisbon/day/day-1", "/trips/lisbon/day/day-2")
      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
      fireEvent.click(screen.getByRole("button", { name: "Go elsewhere" }))

      expect(await screen.findByText("Nothing planned yet")).toBeInTheDocument()
      // Not remounted: the trip was fetched once and the Undo toast is still there.
      expect(screen.getByText("Removed “Bring cash”")).toBeInTheDocument()
      expect(mockGetTrip).toHaveBeenCalledTimes(1)
    })

    it("duplicates for a viewer without trying to save first", async () => {
      mockDuplicateTrip.mockResolvedValue(planned({ id: "copy" }))
      renderWorkspace("/trips/lisbon", planned(), "view")

      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate trip" }))

      await waitFor(() => expect(mockGetTrip.mock.calls[mockGetTrip.mock.calls.length - 1]![1]).toBe("copy"))
      expect(mockUpdateTrip).not.toHaveBeenCalled()
      expect(screen.queryByText(/didn’t go through/)).toBeNull()
    })

    it("does not overwrite the server with an unedited copy before an AI run", async () => {
      mockEnhanceTrip.mockResolvedValue({ run: reviewRun, applied: [] })
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))

      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))
      expect(mockUpdateTrip).not.toHaveBeenCalled()
    })

    it("holds Trip details and Undo while an AI run is working, and keeps the Undo offer", async () => {
      const review = deferred<{ run: typeof reviewRun; applied: string[] }>()
      mockEnhanceTrip.mockReturnValue(review.promise)
      renderWorkspace("/trips/lisbon/day/day-1")

      fireEvent.click(await screen.findByRole("button", { name: "Bring cash" }))
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
      const undo = () => within(screen.getByText("Removed “Bring cash”").closest('[role="status"]') as HTMLElement).getByRole("button", { name: "Undo" })
      expect(undo()).toBeEnabled()

      fireEvent.click(screen.getByRole("button", { name: "Ideas for this day" }))
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Suggest stops" }))
      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))

      expect(undo()).toBeDisabled()
      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      expect(screen.getByRole("menuitem", { name: "Trip details" })).toBeDisabled()
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

      await act(async () => {
        review.resolve({ run: { ...reviewRun, scope: "day", dayId: "day-1" } as typeof reviewRun, applied: [] })
      })
      await waitFor(() => expect(undo()).toBeEnabled())
    })

    it("does not offer to rework the plan around a hotel the AI draft added", async () => {
      const drafted = planned()
      drafted.days[1] = { id: "day-2", date: "2026-07-11", items: [hotel] }
      mockGenerateItinerary.mockResolvedValue({ trip: drafted, summary: "Drafted a food-first weekend.", incompleteDays: [] })
      renderWorkspace("/trips/lisbon", makeTrip())

      fireEvent.click(await screen.findByRole("button", { name: "Draft itinerary" }))
      expect((await screen.findAllByText("Drafted a food-first weekend."))[0]).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
      expect(screen.queryByText(/Staying at Pestana Palace/)).toBeNull()
    })

    it("does not offer a rework for a hotel an AI review added", async () => {
      const reviewed = planned()
      reviewed.days[1] = { id: "day-2", date: "2026-07-11", items: [hotel] }
      mockEnhanceTrip.mockResolvedValue({ run: { ...reviewRun, outcomeReason: "Added a place to stay." }, trip: reviewed, applied: [] })
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))

      expect((await screen.findAllByText("Added a place to stay.")).length).toBeGreaterThan(0)
      expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull()
    })

    it("closes “Clear day” when the traveller moves to another day", async () => {
      renderWithNav("/trips/lisbon/day/day-1", "/trips/lisbon")
      fireEvent.click(await screen.findByRole("button", { name: "More for day 1" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Clear this day" }))
      expect(await screen.findByRole("dialog", { name: "Clear day 1?" })).toBeInTheDocument()

      fireEvent.click(screen.getByText("Go elsewhere"))

      expect(await screen.findByRole("textbox", { name: "Trip name" })).toBeInTheDocument()
      expect(screen.queryByRole("dialog")).toBeNull()
      // Arrow keys work again on the overview.
      fireEvent.keyDown(document.body, { key: "ArrowRight" })
      expect(await screen.findByRole("textbox", { name: "Day title" })).toHaveValue("Arrival")
    })

    it("goes to the overview when a whole-trip review starts from a day", async () => {
      const review = deferred<{ run: typeof reviewRun; applied: string[] }>()
      mockEnhanceTrip.mockReturnValue(review.promise)
      renderWorkspace("/trips/lisbon/day/day-1")

      fireEvent.click(await screen.findByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Improve whole trip with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))

      expect(await screen.findByRole("textbox", { name: "Trip name" })).toBeDisabled()
      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))
      expect(mockEnhanceTrip.mock.calls[0]!.slice(1, 4)).toEqual(["lisbon", "trip", undefined])
      await act(async () => {
        review.resolve({ run: reviewRun, applied: [] })
      })
    })

    it("opens the same stop's editor again after it was closed", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      const row = await screen.findByRole("button", { name: /^(?!More for).*Time Out Market/, expanded: false })
      fireEvent.click(screen.getByRole("button", { name: "Show Time Out Market on the map" }))
      const editStop = () => within(screen.getByRole("complementary", { name: "Selected place" })).getByRole("button", { name: "Edit stop" })

      fireEvent.click(editStop())
      expect(row).toHaveAttribute("aria-expanded", "true")
      fireEvent.click(row)
      expect(row).toHaveAttribute("aria-expanded", "false")

      fireEvent.click(editStop())
      expect(row).toHaveAttribute("aria-expanded", "true")
    })

    it("still saves pending edits when deleting the trip fails", async () => {
      mockDeleteTrip.mockRejectedValue(new Error("HTTP 500"))
      renderWorkspace("/trips/lisbon")

      fireEvent.change(await screen.findByRole("textbox", { name: "Trip name" }), { target: { value: "Lisbon, renamed" } })
      fireEvent.click(screen.getByRole("button", { name: "More trip options" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete trip…" }))
      fireEvent.click(within(await screen.findByRole("dialog", { name: /^Delete/ })).getByRole("button", { name: "Delete trip" }))

      expect(await screen.findByText("That didn’t go through. (HTTP 500)")).toBeInTheDocument()
      await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1), { timeout: 3000 })
      expect((mockUpdateTrip.mock.calls[0]![2] as { name: string }).name).toBe("Lisbon, renamed")
    })
  })

  describe("applying a review", () => {
    const retime = { id: "s-time", kind: "edit", dayId: "day-1", itemId: "it-market", title: "Lunch later, after the crowds", detail: "", confidence: "high" }
    const move = { id: "s-move", kind: "move", dayId: "day-1", toDayId: "day-2", itemId: "it-cafe", title: "Move the mystery cafe", detail: "", confidence: "medium" }
    const run = { ...reviewRun, suggestions: [retime, move] } as EnhancementRun

    it("recaps what changed, names what couldn’t be applied, and keeps it in the review", async () => {
      mockEnhanceTrip.mockResolvedValue({ run, applied: [] })
      const after = planned({ updatedAt: "2026-01-02T00:00:00Z" })
      after.days[0] = { ...after.days[0]!, items: [cash, unpinned, { ...market, time: "14:00" }, fado] }
      mockApplySuggestions.mockResolvedValue({ trip: after, applied: ["s-time"], skipped: ["s-move"], skipReasons: { "s-move": "Day 2 has no room left" } })
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))
      fireEvent.click(await screen.findByRole("button", { name: "Apply 2 changes" }))
      await waitFor(() => expect(mockApplySuggestions).toHaveBeenCalledTimes(1))
      expect(mockApplySuggestions.mock.calls[0]![3]).toEqual(["s-time", "s-move"])

      const sheet = await screen.findByRole("dialog", { name: "What changed" })
      const changes = within(sheet).getByRole("list", { name: "Changes on Day 1" })
      expect(within(changes).getByText("Time Out Market")).toBeInTheDocument()
      expect(within(changes).getByText("12:30 PM → 2:00 PM")).toBeInTheDocument()
      expect(within(sheet).getByText("Move the mystery cafe")).toBeInTheDocument()
      expect(within(sheet).getByText("Day 2 has no room left.")).toBeInTheDocument()
      // Reduced motion (every query matches here): nothing to replay.
      expect(within(sheet).queryByRole("button", { name: "Replay" })).toBeNull()

      // The dock names the one that failed, as an alert that stays.
      const notice = screen.getByText("Applied 1 change. Couldn’t apply “Move the mystery cafe”: Day 2 has no room left.")
      expect(notice.closest('[role="alert"]')).not.toBeNull()

      fireEvent.click(within(sheet).getByRole("button", { name: "Done" }))
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "What changed" })).toBeNull())

      // The applied one left the review; the failed one stays, unticked, with its reason.
      const review = screen.getByRole("region", { name: "AI suggestions" })
      expect(within(review).queryByText("Lunch later, after the crowds")).toBeNull()
      expect(within(review).getByRole("checkbox", { name: /Move the mystery cafe/ })).not.toBeChecked()
      expect(within(review).getByText(/Couldn’t apply: Day 2 has no room left\./)).toBeInTheDocument()
      expect(within(review).getByRole("button", { name: "Apply 0 changes" })).toBeDisabled()
    })

    it("closes the review and says so when everything applied", async () => {
      mockEnhanceTrip.mockResolvedValue({ run: { ...run, suggestions: [retime] }, applied: [] })
      const after = planned({ updatedAt: "2026-01-02T00:00:00Z" })
      after.days[0] = { ...after.days[0]!, items: [cash, unpinned, { ...market, time: "14:00" }, fado] }
      mockApplySuggestions.mockResolvedValue({ trip: after, applied: ["s-time"], skipped: [] })
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))
      fireEvent.click(await screen.findByRole("button", { name: "Apply 1 change" }))

      const sheet = await screen.findByRole("dialog", { name: "What changed" })
      expect(within(sheet).queryByText(/Couldn’t apply/)).toBeNull()
      // Shown in the dock and spoken in the live region.
      expect(screen.getAllByText("Applied 1 change.").length).toBeGreaterThan(0)
      expect(screen.queryByRole("region", { name: "AI suggestions" })).toBeNull()
    })
  })

  describe("saving alongside other writers", () => {
    const later = "2026-01-02T00:00:00Z"
    const ichiran = makeItem({ id: "it-ichiran", title: "Ichiran", createdBy: "ai" })
    /** The server's copy after the concierge added a stop to day 2. */
    const withConcierge = () => {
      const theirs = planned({ updatedAt: later })
      theirs.days[1] = { ...theirs.days[1]!, items: [ichiran] }
      return theirs
    }

    it("keeps the concierge's stop when the traveller has unsaved edits", async () => {
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.change(await screen.findByRole("textbox", { name: "Day title" }), { target: { value: "Landing day" } })
      act(() => emitTripChanged(withConcierge()))

      await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1), { timeout: 3000 })
      const patch = mockUpdateTrip.mock.calls[0]![2] as { days: TripDay[]; baseUpdatedAt: string }
      expect(patch.baseUpdatedAt).toBe(later)
      expect(patch.days[0]!.title).toBe("Landing day")
      expect(patch.days[1]!.items.map((i) => i.id)).toEqual(["it-ichiran"])
    })

    it("replays the traveller's edit over a newer copy when the server says 409", async () => {
      mockUpdateTrip
        .mockRejectedValueOnce(new TripConflictError({ message: "conflict", trip: withConcierge() }))
        .mockImplementation(async (_t: unknown, _id: string, patch: Partial<Trip>) => ({ ...planned(), ...patch, updatedAt: "2026-01-03T00:00:00Z" }))
      renderWorkspace("/trips/lisbon/day/day-1")
      fireEvent.change(await screen.findByRole("textbox", { name: "Day title" }), { target: { value: "Landing day" } })

      await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(2), { timeout: 3000 })
      const [first, second] = mockUpdateTrip.mock.calls.map((call) => call[2] as { days: TripDay[]; baseUpdatedAt: string })
      expect(first!.baseUpdatedAt).toBe("2026-01-01T00:00:00Z")
      expect(second!.baseUpdatedAt).toBe(later)
      expect(second!.days[0]!.title).toBe("Landing day")
      expect(second!.days[1]!.items.map((i) => i.id)).toEqual(["it-ichiran"])
      await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument())
    })

    it("asks whose version to keep when both changed the same thing", async () => {
      mockUpdateTrip.mockRejectedValueOnce(new TripConflictError({ message: "conflict", trip: planned({ updatedAt: later, name: "Their name" }) }))
      renderWorkspace("/trips/lisbon")
      fireEvent.change(await screen.findByRole("textbox", { name: "Trip name" }), { target: { value: "My name" } })

      const alert = await screen.findByText(/Someone else changed the same part of this trip/, {}, { timeout: 3000 })
      expect(screen.getByText("Not saved")).toBeInTheDocument()
      fireEvent.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole("button", { name: "Use theirs" }))
      expect(screen.getByRole("textbox", { name: "Trip name" })).toHaveValue("Their name")
      expect(screen.getByText("Saved")).toBeInTheDocument()
      expect(mockUpdateTrip).toHaveBeenCalledTimes(1)
    })

    it("writes the traveller's version over theirs on “Keep mine”", async () => {
      mockUpdateTrip.mockRejectedValueOnce(new TripConflictError({ message: "conflict", trip: planned({ updatedAt: later, name: "Their name" }) }))
      renderWorkspace("/trips/lisbon")
      fireEvent.change(await screen.findByRole("textbox", { name: "Trip name" }), { target: { value: "My name" } })
      fireEvent.click(await screen.findByRole("button", { name: "Keep mine" }, { timeout: 3000 }))

      await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(2))
      expect(mockUpdateTrip.mock.calls[1]![2]).toMatchObject({ name: "My name", baseUpdatedAt: later })
    })
  })

  describe("stopping an AI run", () => {
    it("unlocks editing and drops the late answer", async () => {
      const review = deferred<{ run: typeof reviewRun; trip: Trip; applied: string[] }>()
      mockEnhanceTrip.mockReturnValue(review.promise)
      renderWorkspace("/trips/lisbon/day/day-1")

      fireEvent.click(await screen.findByRole("button", { name: "Ideas for this day" }))
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Suggest stops" }))
      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))
      expect(screen.getByRole("textbox", { name: "Day title" })).toBeDisabled()
      const signal = mockEnhanceTrip.mock.calls[0]![5] as AbortSignal

      fireEvent.click(screen.getByRole("button", { name: "Stop" }))
      expect(signal.aborted).toBe(true)
      expect(screen.getByRole("textbox", { name: "Day title" })).toBeEnabled()

      await act(async () => {
        review.resolve({ run: { ...reviewRun, outcomeReason: "Added two stops." } as typeof reviewRun, trip: planned({ name: "Late answer", updatedAt: "2026-01-02T00:00:00Z" }), applied: [] })
      })
      expect(screen.queryByText("Added two stops.")).toBeNull()
      expect(screen.getByRole("link", { name: "Lisbon Long Weekend" })).toBeInTheDocument()
    })
  })

  describe("following an AI review", () => {
    const live = (queue: RunQueueInfo, more: Partial<EnhancementRun> = {}): EnhancementRun =>
      ({ ...reviewRun, status: "running", queue, ...more }) as EnhancementRun
    const working = live({ state: "working", attempt: 1, maxAttempts: 3 })
    const notice = (text: string) => screen.getAllByText(text)[0]

    /** "Improve with AI" → "Review trip"; returns the progress callback the page handed to the API. */
    async function startTripReview() {
      fireEvent.click(await screen.findByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))
      await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalledTimes(1))
      return mockEnhanceTrip.mock.calls[0]![6] as (run: EnhancementRun) => void
    }

    it("says where the review is in the server's queue, in a live region", async () => {
      const review = deferred<EnhanceTripResult>()
      mockEnhanceTrip.mockReturnValue(review.promise)
      renderWorkspace("/trips/lisbon")
      const onProgress = await startTripReview()

      expect(screen.getByText("Starting the review…")).toHaveAttribute("role", "status")
      act(() => onProgress(live({ state: "queued", attempt: 0, maxAttempts: 3 })))
      expect(screen.getByText("Starting the review…")).toBeInTheDocument()
      act(() => onProgress(working))
      expect(screen.getByText("Reviewing your trip…")).toHaveAttribute("role", "status")
      act(() => onProgress(live({ state: "queued", attempt: 1, maxAttempts: 3, lastError: "The attempt ran out of time." })))
      expect(screen.getByText("The AI was slow, so it’s trying again (attempt 2 of 3)…")).toBeInTheDocument()
      expect(screen.getByText("It keeps going if you leave this page.")).toBeInTheDocument()
      expect(screen.queryByText(/This usually takes/)).toBeNull()

      await act(async () => review.resolve({ run: { ...reviewRun, outcomeReason: "Added lunch." } as EnhancementRun, applied: [] }))
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
      expect(notice("Added lunch.")).toBeInTheDocument()
    })

    it("takes up a review already running on the server when the trip opens, and follows it once", async () => {
      mockListEnhancements.mockResolvedValue([working, { ...reviewRun, id: "run-0" }])
      const review = deferred<EnhanceTripResult>()
      mockFollowEnhancement.mockReturnValue(review.promise)
      renderWorkspace("/trips/lisbon/day/day-1")

      // A whole-trip review shows on the day that is open, with Stop.
      expect(await screen.findByText("Reviewing your trip…")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: "Day title" })).toBeDisabled()
      expect(mockFollowEnhancement).toHaveBeenCalledTimes(1)
      expect(mockFollowEnhancement.mock.calls[0]!.slice(1, 3)).toEqual(["lisbon", working])

      // Back to the tab while following: no second look, no second follow.
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"))
      })
      expect(mockListEnhancements).toHaveBeenCalledTimes(1)
      expect(mockFollowEnhancement).toHaveBeenCalledTimes(1)

      await act(async () =>
        review.resolve({
          run: { ...reviewRun, outcomeReason: "Added two stops." } as EnhancementRun,
          trip: planned({ name: "Reviewed", updatedAt: "2026-01-02T00:00:00Z" }),
          applied: [],
        }),
      )
      expect(notice("Added two stops.")).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: "Day title" })).toBeEnabled()
    })

    it("leaves a finished review, and a viewer's page, alone", async () => {
      mockListEnhancements.mockResolvedValue([{ ...reviewRun, status: "error" }])
      renderWorkspace("/trips/lisbon")
      await waitFor(() => expect(mockListEnhancements).toHaveBeenCalledTimes(1))
      expect(mockFollowEnhancement).not.toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeEnabled()
    })

    it("doesn't look for a review for someone who can only view", async () => {
      mockListEnhancements.mockResolvedValue([working])
      renderWorkspace("/trips/lisbon", planned(), "view")
      expect(await screen.findByText("Trams, tiles and pastries.")).toBeInTheDocument()
      expect(mockListEnhancements).not.toHaveBeenCalled()
    })

    it("stops following on Stop, says the review may still finish, and doesn't take it up again", async () => {
      mockListEnhancements.mockResolvedValue([working])
      mockFollowEnhancement.mockReturnValue(new Promise(() => undefined))
      renderWorkspace("/trips/lisbon")

      fireEvent.click(await screen.findByRole("button", { name: "Stop" }))
      expect((mockFollowEnhancement.mock.calls[0]![3] as AbortSignal).aborted).toBe(true)
      expect(notice("Stopped following the AI review. It may still finish on the server and add places to your trip.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeEnabled()

      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"))
      })
      await waitFor(() => expect(mockListEnhancements).toHaveBeenCalledTimes(2))
      expect(mockFollowEnhancement).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    })

    it("says the review is still running when the page stops waiting, without claiming nothing changed", async () => {
      const still = "The AI review is still running on the server. Its changes will show up here when it finishes."
      mockEnhanceTrip.mockImplementation(async (...args: unknown[]) => {
        ;(args[6] as (run: EnhancementRun) => void)(working)
        throw new PollTimeoutError({ message: still })
      })
      renderWorkspace("/trips/lisbon")
      await startTripReview()
      expect(await screen.findByText(still, { selector: "span" })).toBeInTheDocument()
      expect(screen.queryByText(/Nothing in your itinerary changed/)).toBeNull()
      expect(screen.getByRole("button", { name: "Improve with AI" })).toBeEnabled()
    })

    it("promises nothing changed only for a start the server refused, or a run it settled as failed", async () => {
      mockEnhanceTrip.mockRejectedValueOnce(new HttpStatusError({ status: 400, message: "dayId required for day scope" }))
      renderWorkspace("/trips/lisbon")
      await startTripReview()
      expect(await screen.findByText("The AI review couldn’t start, so nothing in your itinerary changed. (dayId required for day scope)")).toBeInTheDocument()

      mockEnhanceTrip.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      fireEvent.click(screen.getByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))
      expect(await screen.findByText("Couldn’t reach the server to start the AI review. Check your connection and try again.")).toBeInTheDocument()

      mockEnhanceTrip.mockResolvedValueOnce({
        run: { ...reviewRun, status: "error", outcomeReason: "The AI review failed before it could add places.", error: "deadline" } as EnhancementRun,
        applied: [],
      })
      fireEvent.click(screen.getByRole("button", { name: "Improve with AI" }))
      fireEvent.click(within(screen.getByRole("dialog", { name: "Improve this trip" })).getByRole("button", { name: "Review trip" }))
      const failed = "The AI review failed before it could add places. Nothing in your itinerary changed, so you can run it again."
      expect((await screen.findAllByText(failed)).length).toBeGreaterThan(0)
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

      mockGetTrip.mockResolvedValue({ trip: planned(), access: "owner" })
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
      expect(await screen.findByRole("textbox", { name: "Trip name" })).toHaveValue("Lisbon Long Weekend")
    })
  })
})
