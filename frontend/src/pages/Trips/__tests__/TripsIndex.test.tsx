import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import type { AtlasMapProps } from "../map/AtlasMap"
import type { TripSummary } from "../types"
import { makeSummary } from "./tripFixtures"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  useViewer: () => ({ id: "u1", name: "Ant" }),
  clerkEnabled: true,
}))

const mockListTrips = vi.fn()
const mockDeleteTrip = vi.fn()
const mockGetTrip = vi.fn()
const mockDuplicateTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  listTrips: (...args: unknown[]) => mockListTrips(...args),
  deleteTrip: (...args: unknown[]) => mockDeleteTrip(...args),
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  duplicateTrip: (...args: unknown[]) => mockDuplicateTrip(...args),
  updateTrip: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  leaveTrip: vi.fn(),
}))

// The real map needs WebGL; the stub lists the pins it was given.
vi.mock("../map/AtlasMap", () => ({
  useIsDark: () => false,
  canRenderMap: () => false,
  AtlasMap: ({ pins, label, onSelect }: AtlasMapProps) => (
    <div role="region" aria-label={label}>
      {pins.map((pin) => (
        <button key={pin.id} type="button" onClick={() => onSelect?.(pin.id)}>
          {`Pin: ${pin.title}`}
        </button>
      ))}
    </div>
  ),
}))

import { TripsIndex } from "../TripsIndex"

// "Today" is 15 Jun 2026 for every test (Date only; timers stay real).
const NOW = new Date("2026-06-15T12:00:00Z")

const live = makeSummary({
  id: "seoul",
  name: "Seoul Now",
  destinations: ["Seoul"],
  startDate: "2026-06-13",
  endDate: "2026-06-20",
  center: { lat: 37.57, lng: 126.98 },
  tags: ["food"],
})
const soon = makeSummary({
  id: "lisbon",
  slug: "lisbon-2026",
  name: "Lisbon Later",
  destinations: ["Lisbon", "Porto"],
  startDate: "2026-06-20",
  endDate: "2026-06-24",
  center: { lat: 38.72, lng: -9.14 },
})
const later = makeSummary({
  id: "kyoto",
  name: "Kyoto Autumn",
  destinations: ["Kyoto"],
  startDate: "2026-11-01",
  endDate: "2026-11-05",
})
const done = makeSummary({
  id: "oslo",
  name: "Oslo Winter",
  destinations: ["Oslo"],
  startDate: "2026-01-05",
  endDate: "2026-01-09",
  center: { lat: 59.91, lng: 10.75 },
})

function Path() {
  const { pathname } = useLocation()
  return <p data-testid="path">{pathname}</p>
}

function renderIndex() {
  return render(
    <MemoryRouter initialEntries={["/trips"]}>
      <Routes>
        <Route path="/trips" element={<TripsIndex />} />
        <Route path="*" element={<Path />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The block (heading + cards) for one timing bucket. */
function bucket(label: RegExp) {
  const heading = screen.getByRole("heading", { level: 3, name: label })
  const list = heading.parentElement?.parentElement?.querySelector("ul")
  if (!list) throw new Error(`No list under ${label}`)
  return within(list)
}

const cardTitles = () => screen.queryAllByRole("heading", { level: 4 }).map((h) => h.textContent)

describe("TripsIndex", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    mockListTrips.mockResolvedValue([done, later, soon, live])
    mockDeleteTrip.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("shows a loading state, then cards bucketed by timing", async () => {
    let resolve: (trips: TripSummary[]) => void = () => {}
    mockListTrips.mockReturnValue(new Promise<TripSummary[]>((r) => (resolve = r)))
    renderIndex()

    expect(screen.getByRole("status", { name: "Loading trips" })).toBeInTheDocument()
    expect(cardTitles()).toEqual([])

    resolve([done, later, soon, live])
    expect(await screen.findByRole("heading", { level: 3, name: "Happening now · 1" })).toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Loading trips" })).toBeNull()

    expect(bucket(/^Happening now/).getByRole("heading", { level: 4, name: "Seoul Now" })).toBeInTheDocument()
    expect(bucket(/^Happening now/).getByText("Day 3 of 8")).toBeInTheDocument()

    // Upcoming is soonest-first.
    const upcoming = bucket(/^Upcoming · 2/)
    expect(upcoming.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Lisbon Later", "Kyoto Autumn"])
    expect(upcoming.getByText("In 5 days")).toBeInTheDocument()

    expect(bucket(/^Past · 1/).getByRole("heading", { level: 4, name: "Oslo Winter" })).toBeInTheDocument()
    expect(bucket(/^Past/).getByText("Jan 2026")).toBeInTheDocument()

    // Buckets render in the order now → upcoming → past.
    expect(cardTitles()).toEqual(["Seoul Now", "Lisbon Later", "Kyoto Autumn", "Oslo Winter"])
    expect(screen.getByText("Atlas · 4 trips · 3 ahead")).toBeInTheDocument()
  })

  it("shows three or fewer trips as one list with no timing headings", async () => {
    mockListTrips.mockResolvedValue([done, soon, live])
    renderIndex()

    expect(await screen.findByRole("heading", { level: 4, name: "Seoul Now" })).toBeInTheDocument()
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([])
    expect(screen.queryByText(/Happening now|Upcoming ·|Past ·/)).toBeNull()
    // Still ordered now → upcoming → past, and each card keeps its timing badge.
    expect(cardTitles()).toEqual(["Seoul Now", "Lisbon Later", "Oslo Winter"])
    const list = screen.getByRole("heading", { level: 4, name: "Seoul Now" }).closest("ul")!
    expect(within(list).getAllByRole("listitem")).toHaveLength(4) // three trips + the "Plan another trip" cell
    expect(within(list).getByText("Day 3 of 8")).toBeInTheDocument()
    expect(within(list).getByText("Jan 2026")).toBeInTheDocument()
  })

  it("drops the headings when a search narrows four trips to three or fewer", async () => {
    mockListTrips.mockResolvedValue([
      done,
      later,
      soon,
      live,
      makeSummary({ id: "busan", name: "Busan Later", destinations: ["Busan"], startDate: "2026-09-01", endDate: "2026-09-03" }),
    ])
    renderIndex()
    expect(await screen.findByRole("heading", { level: 3, name: "Upcoming · 3" })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "later" } })
    await waitFor(() => expect(cardTitles()).toEqual(["Lisbon Later", "Busan Later"]))
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([])
  })

  it("offers “Plan another trip” under the list, but not while searching", async () => {
    renderIndex()
    expect(await screen.findByRole("link", { name: /Plan another trip/ })).toHaveAttribute("href", "/trips/new")
    expect(screen.getAllByRole("link", { name: /Plan another trip/ })).toHaveLength(1)

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "seoul" } })
    await waitFor(() => expect(cardTitles()).toEqual(["Seoul Now"]))
    expect(screen.queryByRole("link", { name: /Plan another trip/ })).toBeNull()
  })

  it("draws the cover chart when no map still is available", async () => {
    renderIndex()
    await screen.findByRole("heading", { level: 4, name: "Seoul Now" })
    // Stills need WebGL; without it no card shows a picture.
    expect(document.querySelectorAll("article img")).toHaveLength(0)
  })

  it("links each card to its trip, preferring the slug", async () => {
    renderIndex()
    expect(await screen.findByRole("link", { name: "Lisbon Later, Jun 20 – 24, 2026" })).toHaveAttribute("href", "/trips/lisbon-2026")
    expect(screen.getByRole("link", { name: "Seoul Now, Jun 13 – 20, 2026" })).toHaveAttribute("href", "/trips/seoul")
    expect(screen.getByRole("link", { name: /Now: Seoul Now/ })).toHaveAttribute("href", "/trips/seoul")
  })

  it("pins only trips that have a centre, and a pin opens its trip", async () => {
    renderIndex()
    const globe = await screen.findByRole("region", { name: /Globe with 3 trips pinned/ })
    expect(within(globe).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Pin: Oslo Winter",
      "Pin: Lisbon Later",
      "Pin: Seoul Now",
    ])

    fireEvent.click(within(globe).getByRole("button", { name: "Pin: Lisbon Later" }))
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-2026")
  })

  it("filters by name, place or tag and says when nothing matches", async () => {
    renderIndex()
    const search = await screen.findByRole("searchbox")

    fireEvent.change(search, { target: { value: "porto" } })
    await waitFor(() => expect(cardTitles()).toEqual(["Lisbon Later"]))
    expect(screen.queryByRole("heading", { level: 3, name: /Happening now/ })).toBeNull()
    expect(screen.getByRole("region", { name: /Globe with 1 trip pinned/ })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: "FOOD" } })
    await waitFor(() => expect(cardTitles()).toEqual(["Seoul Now"]))

    fireEvent.change(search, { target: { value: "atlantis" } })
    expect(await screen.findByText("No trips match “atlantis”.")).toBeInTheDocument()
    expect(cardTitles()).toEqual([])

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    await waitFor(() => expect(cardTitles()).toHaveLength(4))
    expect(screen.queryByText(/No trips match/)).toBeNull()
  })

  it("shows the empty state when there are no trips", async () => {
    mockListTrips.mockResolvedValue([])
    renderIndex()

    expect(await screen.findByRole("link", { name: "Plan your first trip" })).toHaveAttribute("href", "/trips/new")
    expect(screen.getByText("Atlas · Nothing pinned yet")).toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(cardTitles()).toEqual([])
  })

  it("shows an error with a retry that re-fetches", async () => {
    mockListTrips.mockRejectedValueOnce(new Error("HTTP 500"))
    renderIndex()

    const alert = await screen.findByRole("alert")
    expect(within(alert).getByRole("heading", { name: "Couldn’t load your trips" })).toBeInTheDocument()
    expect(alert).toHaveTextContent("(HTTP 500)")
    expect(mockListTrips).toHaveBeenCalledTimes(1)

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("heading", { level: 4, name: "Seoul Now" })).toBeInTheDocument()
    expect(mockListTrips).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("deletes a trip after confirming, and removes its card", async () => {
    renderIndex()
    fireEvent.click(await screen.findByRole("button", { name: "Options for Oslo Winter" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete trip…" }))

    const dialog = await screen.findByRole("dialog", { name: "Delete “Oslo Winter”?" })
    expect(mockDeleteTrip).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete trip" }))

    await waitFor(() => expect(mockDeleteTrip).toHaveBeenCalledTimes(1))
    expect(mockDeleteTrip.mock.calls[0]![1]).toBe("oslo")
    await waitFor(() => expect(cardTitles()).toEqual(["Seoul Now", "Lisbon Later", "Kyoto Autumn"]))
    expect(screen.queryByRole("heading", { level: 3, name: /^Past/ })).toBeNull()
    expect(await screen.findByText("Deleted “Oslo Winter”.")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // Local removal only; the list is not re-fetched.
    expect(mockListTrips).toHaveBeenCalledTimes(1)
  })

  it("keeps the trip when the confirmation is declined", async () => {
    renderIndex()
    fireEvent.click(await screen.findByRole("button", { name: "Options for Oslo Winter" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete trip…" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete “Oslo Winter”?" })

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep trip" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mockDeleteTrip).not.toHaveBeenCalled()
    expect(cardTitles()).toContain("Oslo Winter")
  })

  it("keeps the card and explains when the delete fails", async () => {
    mockDeleteTrip.mockRejectedValue(new Error("HTTP 403"))
    renderIndex()
    fireEvent.click(await screen.findByRole("button", { name: "Options for Oslo Winter" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete trip…" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete “Oslo Winter”?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete trip" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t delete this trip. (HTTP 403)")
    // The open dialog hides the page from the accessibility tree, so look by text.
    expect(screen.getByText("Oslo Winter")).toBeInTheDocument()
    expect(screen.queryByText(/^Deleted/)).toBeNull()
  })

  it("hides Delete for trips the viewer doesn't own and for trips shared with everyone", async () => {
    mockListTrips.mockResolvedValue([
      makeSummary({ id: "mine", name: "Mine" }),
      makeSummary({ id: "guest", name: "Guest Trip", access: "edit", collaborators: [{ userId: "u1", role: "editor" }] }),
      makeSummary({ id: "korea-2026", name: "Korea Seed", sharedWithAllUsers: true }),
    ])
    renderIndex()

    const labelsFor = (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: `Options for ${name}` }))
      const labels = within(screen.getByRole("menu", { name: `Options for ${name}` }))
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
      fireEvent.click(screen.getByRole("button", { name: `Options for ${name}` }))
      return labels
    }

    await screen.findByRole("heading", { level: 4, name: "Mine" })
    expect(labelsFor("Mine")).toEqual(["Share…", "Duplicate", "Delete trip…"])
    expect(labelsFor("Guest Trip")).toEqual(["Share…", "Duplicate"])
    expect(labelsFor("Korea Seed")).toEqual(["Share…", "Duplicate"])
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("duplicates a trip and opens the copy", async () => {
    mockGetTrip.mockResolvedValue({ trip: { id: "oslo", name: "Oslo Winter" }, access: "owner" })
    mockDuplicateTrip.mockResolvedValue({ id: "oslo-copy" })
    renderIndex()
    fireEvent.click(await screen.findByRole("button", { name: "Options for Oslo Winter" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }))

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/oslo-copy")
    expect(mockGetTrip.mock.calls[0]![1]).toBe("oslo")
    expect(mockDuplicateTrip.mock.calls[0]![1]).toEqual({ id: "oslo", name: "Oslo Winter" })
  })

  it("focuses search on “/” and opens the new-trip page on “n”", async () => {
    renderIndex()
    const search = await screen.findByRole("searchbox")
    expect(search).not.toHaveFocus()

    fireEvent.keyDown(document.body, { key: "/" })
    expect(search).toHaveFocus()

    // Typing in the field must not trigger page shortcuts.
    fireEvent.keyDown(search, { key: "n" })
    expect(screen.queryByTestId("path")).toBeNull()

    fireEvent.keyDown(document.body, { key: "n" })
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/new")
  })
})
