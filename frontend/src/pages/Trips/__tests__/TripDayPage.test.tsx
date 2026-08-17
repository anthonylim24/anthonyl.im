import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ItineraryItem, Trip } from "../types"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  clerkEnabled: true,
}))

const mockGetTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
}))

vi.mock("../../Korea/entityIndex", () => ({
  EntityIndexProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("../../Korea/LinkifiedText", () => ({
  LinkifiedText: ({ children }: { children: unknown }) => children,
}))

vi.mock("../../Korea/SmartEntity", () => ({
  SmartEntity: ({ name }: { name: string }) => <span>{name}</span>,
}))

vi.mock("../../Korea/ReservationCard", () => ({
  ReservationCard: ({ reservation }: { reservation: { id: string; title: string } }) => (
    <article>{reservation.title}</article>
  ),
}))

vi.mock("../../Korea/MapModeOverlay", () => ({
  MapModeOverlay: ({
    dayTitle,
    placesUrl,
    onClose,
  }: {
    dayTitle: string
    placesUrl: string
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Map Mode">
      <p>{dayTitle}</p>
      <p>{placesUrl}</p>
      <button type="button" onClick={onClose}>
        Close map
      </button>
    </div>
  ),
}))

import { TripDayPage } from "../TripDayPage"

const SENSO: ItineraryItem = {
  id: "it-a",
  kind: "place",
  title: "Senso-ji",
  time: "10:00",
  endTime: "11:30",
  status: "none",
  location: {
    name: "Senso-ji",
    address: "2-3-1 Asakusa",
    lat: 35.7148,
    lng: 139.7967,
    category: "shrine",
    source: "user",
  },
  createdBy: "user",
}

const CAFE: ItineraryItem = {
  id: "it-b",
  kind: "place",
  title: "Kagurazaka cafe",
  time: "15:00",
  status: "none",
  location: { name: "Kagurazaka cafe", lat: 35.701, lng: 139.74, category: "cafe", source: "user" },
  createdBy: "user",
}

const DINNER: ItineraryItem = {
  id: "it-res",
  kind: "reservation",
  title: "Kanda Yabu Soba",
  time: "19:00",
  status: "booked",
  location: { name: "Kanda Yabu Soba", lat: 35.695, lng: 139.77, source: "user" },
  reservation: { type: "meal", status: "confirmed", confirmation: "YABU-1" },
  createdBy: "user",
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        title: "Arrival",
        city: "Tokyo",
        neighborhoods: ["Asakusa"],
        items: [SENSO, CAFE, DINNER],
      },
      { id: "day-2", date: "2026-07-11", title: "Tsukiji", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function renderDay(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/:tripId/day/:dayId" element={<TripDayPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripDayPage", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
    mockGetToken.mockResolvedValue("test-token")
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows a loading state until the trip arrives", () => {
    mockGetTrip.mockReturnValue(new Promise(() => undefined))
    renderDay("/trips/trip-1/day/day-1")
    expect(screen.getByRole("status", { name: "Loading day" })).toBeInTheDocument()
  })

  it("renders a 404 when the day is missing from the trip", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    renderDay("/trips/trip-1/day/day-missing")
    expect(await screen.findByRole("heading", { name: "Day not found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to the trip" })).toHaveAttribute("href", "/trips/trip-1")
  })

  it("keeps the error retry path", async () => {
    mockGetTrip.mockRejectedValue(new Error("offline"))
    renderDay("/trips/trip-1/day/day-1")
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn.t open this day/)
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })

  it("uses ReservationCard, keeps times and walk distance, and edits on the living document", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    renderDay("/trips/trip-1/day/day-1")

    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument()
    expect(screen.getByText("Kanda Yabu Soba")).toBeInTheDocument()
    expect(document.getElementById("item-it-res")).toBeTruthy()
    expect(document.getElementById("item-it-a")).toBeTruthy()
    expect(screen.getByText("10:00")).toBeInTheDocument()
    expect(screen.getByText("11:30")).toBeInTheDocument()
    expect(screen.getByText("15:00")).toBeInTheDocument()
    expect(screen.getAllByText(/min walk|h walk/).length).toBeGreaterThan(0)
    expect(screen.getByRole("link", { name: "Edit this day" })).toHaveAttribute("href", "/trips/trip-1#day-1")
    expect(screen.getByRole("button", { name: "Enter Map Mode" })).toBeInTheDocument()
  })

  it("points the edit link at a slug hash, not /edit", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip({ slug: "tokyo" }), access: "owner" })
    renderDay("/trips/tokyo/day/day-1")
    expect(await screen.findByRole("link", { name: "Edit this day" })).toHaveAttribute("href", "/trips/tokyo#day-1")
  })

  it("hides the edit link for viewers", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "view" })
    renderDay("/trips/trip-1/day/day-1")
    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Edit this day" })).toBeNull()
  })

  it("opens Map Mode with the trips places URL and unmounts it on close", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    renderDay("/trips/trip-1/day/day-1")
    fireEvent.click(await screen.findByRole("button", { name: "Enter Map Mode" }))
    expect(await screen.findByRole("dialog", { name: "Map Mode" })).toHaveTextContent(
      "/api/trips/trip-1/days/day-1/places",
    )
    fireEvent.click(screen.getByRole("button", { name: "Close map" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Map Mode" })).toBeNull())
  })

  it("moves between days with arrow keys when a neighbor exists", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    renderDay("/trips/trip-1/day/day-1")
    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(await screen.findByRole("heading", { name: "Tsukiji" })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByRole("heading", { name: "Tsukiji" })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(await screen.findByRole("heading", { name: "Arrival" })).toBeInTheDocument()
  })

  it("does not change days with arrows while Map Mode is open", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    renderDay("/trips/trip-1/day/day-1?map=1")
    expect(await screen.findByRole("dialog", { name: "Map Mode" })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByRole("heading", { name: "Arrival" })).toBeInTheDocument()
  })
})
