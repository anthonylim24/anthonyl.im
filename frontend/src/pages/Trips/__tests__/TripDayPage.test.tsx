import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ItineraryItem, Trip } from "../types"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  clerkEnabled: true,
}))

const mockGetTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
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

const RESERVATION: ItineraryItem = {
  id: "res-1",
  kind: "reservation",
  title: "Jungsik",
  time: "19:00",
  endTime: "21:00",
  notes: "Window table",
  status: "booked",
  location: {
    name: "Jungsik",
    address: "11 Seolleung-ro 158-gil",
    lat: 37.5,
    lng: 127.0,
    source: "user",
  },
  reservation: {
    type: "meal",
    status: "pending",
    confirmation: "JS-44",
    contact: "+82 2-1234-5678",
    url: "https://jungsik.kr",
  },
  createdBy: "user",
}

const SECTION: ItineraryItem = {
  id: "sec-1",
  kind: "section",
  title: "Evening in Gangnam",
  time: "18:00",
  notes: "Dress warm\nLeave time for the walk",
  status: "none",
  createdBy: "user",
}

const PLACE: ItineraryItem = {
  id: "place-1",
  kind: "place",
  title: "Garosu-gil",
  time: "16:30",
  notes: "Coffee first",
  status: "optional",
  location: {
    name: "Garosu-gil",
    address: "Sinsa-dong",
    lat: 37.52,
    lng: 127.02,
    category: "neighborhood",
    source: "user",
  },
  createdBy: "user",
}

const NOTE: ItineraryItem = {
  id: "note-1",
  kind: "note",
  title: "Charge the camera",
  status: "none",
  createdBy: "user",
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "korea-2026",
    slug: "korea-2026",
    ownerId: "u1",
    name: "Seoul and Busan",
    destinations: ["Seoul"],
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    timezone: "Asia/Seoul",
    status: "active",
    tags: [],
    collaborators: [],
    days: [
      { id: "day-1", date: "2026-12-01", title: "Arrival", items: [] },
      {
        id: "day-2",
        date: "2026-12-02",
        title: "Old Seoul",
        city: "Seoul",
        notes: "Start at the palace.",
        neighborhoods: ["Jongno", "Ikseon-dong", "Bukchon", "Extra"],
        weather: { highC: 7, lowC: -1, condition: "Clouds" },
        callouts: [{ icon: "!", tone: "warn", body: "Bookings close at 4." }],
        items: [RESERVATION, SECTION, PLACE, NOTE],
      },
      { id: "day-3", date: "2026-12-03", title: "KTX south", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-03-03T00:00:00Z",
    ...overrides,
  }
}

function renderDay(path = "/trips/korea-2026/day/day-2") {
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
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("shows a timeline-shaped loading skeleton", () => {
    mockGetTrip.mockReturnValue(new Promise(() => {}))
    renderDay()
    expect(screen.getByRole("status", { name: "Loading day" })).toBeInTheDocument()
  })

  it("shows an inline error with retry", async () => {
    mockGetTrip.mockRejectedValueOnce(new Error("offline"))
    mockGetTrip.mockResolvedValueOnce({ trip: makeTrip(), access: "view" })
    renderDay()
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this day")
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("heading", { name: "Old Seoul" })).toBeInTheDocument()
  })

  it("renders the day header, timeline, chips, and adjacent links", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    const { container } = renderDay()

    expect(await screen.findByRole("heading", { name: "Old Seoul" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Seoul and Busan" })).toHaveAttribute("href", "/trips/korea-2026")
    expect(screen.getByText("7°C / -1°C, Clouds")).toBeInTheDocument()
    expect(screen.getByText("Jongno")).toBeInTheDocument()
    expect(screen.getByText("Ikseon-dong")).toBeInTheDocument()
    expect(screen.getByText("Bukchon")).toBeInTheDocument()
    expect(screen.queryByText("Extra")).not.toBeInTheDocument()
    expect(screen.getByText("Start at the palace.")).toBeInTheDocument()

    expect(screen.getByRole("link", { name: "Edit this day" })).toHaveAttribute("href", "/trips/korea-2026/edit#day-2")
    expect(screen.getByRole("link", { name: "Arrival" })).toHaveAttribute("href", "/trips/korea-2026/day/day-1")
    expect(screen.getByRole("link", { name: "KTX south" })).toHaveAttribute("href", "/trips/korea-2026/day/day-3")

    const timeline = screen.getByRole("list", { name: "Day timeline" })
    expect(timeline).toBeInTheDocument()
    expect(screen.getByText("19:00")).toBeInTheDocument()
    expect(screen.getByText("21:00")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Jungsik" })).toBeInTheDocument()
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.getByText("Confirmation JS-44")).toBeInTheDocument()
    const mapsLinks = screen.getAllByRole("link", { name: "Maps" })
    expect(mapsLinks[0]).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=11%20Seolleung-ro%20158-gil",
    )
    expect(mapsLinks.some((link) => link.getAttribute("href")?.includes("Sinsa-dong"))).toBe(true)
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+82212345678")
    expect(screen.getByRole("link", { name: "Booking" })).toHaveAttribute("href", "https://jungsik.kr")

    expect(screen.getByText("Bookings close at 4.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Evening in Gangnam" })).toBeInTheDocument()
    expect(screen.getByText("Dress warm")).toBeInTheDocument()
    expect(screen.getByText("Garosu-gil")).toBeInTheDocument()
    expect(screen.getByText("Charge the camera")).toBeInTheDocument()
    expect(screen.getAllByText("No time set").length).toBeGreaterThan(0)

    expect(document.getElementById("item-res-1")).not.toBeNull()
    expect(document.getElementById("item-place-1")).not.toBeNull()
    expect(document.getElementById("item-note-1")).not.toBeNull()
    expect(document.getElementById("item-sec-1")).not.toBeNull()

    expect(container.innerHTML).not.toMatch(/uppercase tracking/)
    expect(container.textContent).not.toContain("\u2014")
    expect(container.textContent).not.toContain("\u2013")
  })

  it("opens Map Mode and honors the item hash highlight", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "edit" })
    window.location.hash = "#item-res-1"
    renderDay("/trips/korea-2026/day/day-2#item-res-1")

    expect(await screen.findByRole("heading", { name: "Jungsik" })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.getElementById("item-res-1")?.className).toMatch(/ring-2/)
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Map Mode" }))
    expect(await screen.findByRole("dialog", { name: "Map Mode" })).toBeInTheDocument()
    expect(screen.getByText("/api/trips/korea-2026/days/day-2/places")).toBeInTheDocument()
  })

  it("renders the day-not-found state", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "view" })
    renderDay("/trips/korea-2026/day/missing")
    expect(await screen.findByRole("heading", { name: "Day not found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to the trip" })).toHaveAttribute("href", "/trips/korea-2026")
  })

  it("shows a composed empty day for viewers", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "view" })
    renderDay("/trips/korea-2026/day/day-1")
    expect(await screen.findByText("Nothing on this day yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Map Mode" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Edit this day" })).not.toBeInTheDocument()
  })
})
