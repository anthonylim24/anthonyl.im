import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ItineraryItem, Trip } from "../types"
import { todayIsoIn } from "../theme"

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

import { TripOverview } from "../TripOverview"

const FLIGHT: ItineraryItem = {
  id: "res-flight",
  kind: "reservation",
  title: "KE012",
  time: "10:40",
  status: "booked",
  reservation: { type: "flight", status: "confirmed" },
  createdBy: "user",
}

const DINNER: ItineraryItem = {
  id: "res-dinner",
  kind: "reservation",
  title: "Jungsik",
  time: "19:00",
  status: "booked",
  reservation: { type: "meal", status: "pending" },
  createdBy: "user",
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "korea-2026",
    slug: "korea-2026",
    ownerId: "u1",
    name: "Seoul and Busan",
    destinations: ["Seoul", "Busan"],
    startDate: "2026-12-01",
    endDate: "2026-12-04",
    timezone: "Asia/Seoul",
    status: "active",
    tags: ["migrated", "honeymoon"],
    description: "A winter loop through Seoul kitchens and the Busan coast.",
    collaborators: [{ userId: "u2", role: "editor" }],
    appearance: {
      accent: "rose",
      subtitle: "Twelve days, two cities",
      headline: "Private dossier for the late-May loop.",
    },
    days: [
      {
        id: "day-1",
        date: "2026-12-01",
        title: "Arrival",
        city: "Seoul",
        notes: "Land, drop bags, walk Cheonggyecheon.",
        neighborhoods: ["Jongno", "Ikseon-dong"],
        weather: { highC: 8, lowC: -2, condition: "Clear" },
        items: [FLIGHT],
      },
      {
        id: "day-2",
        date: "2026-12-02",
        title: "Old Seoul",
        city: "Seoul",
        items: [DINNER],
      },
      { id: "day-3", date: "2026-12-03", title: "KTX south", city: "Busan", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-03-03T00:00:00Z",
    ...overrides,
  }
}

function renderOverview(path = "/trips/korea-2026") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/:tripId" element={<TripOverview />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripOverview", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
  })

  it("shows a shaped loading skeleton", () => {
    mockGetTrip.mockReturnValue(new Promise(() => {}))
    renderOverview()
    expect(screen.getByRole("status", { name: "Loading trip" })).toBeInTheDocument()
  })

  it("shows an inline error with retry", async () => {
    mockGetTrip.mockRejectedValueOnce(new Error("offline"))
    mockGetTrip.mockResolvedValueOnce({ trip: makeTrip(), access: "view" })
    renderOverview()
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this trip")
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("heading", { name: "Seoul and Busan" })).toBeInTheDocument()
  })

  it("renders the split hero, day grid, and grouped reservations", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    const { container } = renderOverview()

    expect(await screen.findByRole("heading", { name: "Seoul and Busan" })).toBeInTheDocument()
    expect(screen.getByText(/days to go/i)).toBeInTheDocument()
    expect(screen.getByText("Twelve days, two cities")).toBeInTheDocument()
    expect(screen.getByText("Private dossier for the late-May loop.")).toBeInTheDocument()

    expect(container.querySelector(".trip-plate")).not.toBeNull()
    expect(screen.getByText("Destinations")).toBeInTheDocument()
    expect(screen.getByText("Seoul, Busan")).toBeInTheDocument()
    expect(screen.getByText("Time zone")).toBeInTheDocument()
    expect(screen.getByText("Asia/Seoul")).toBeInTheDocument()
    expect(screen.getByText("Sharing")).toBeInTheDocument()
    expect(screen.getByText("1 editor")).toBeInTheDocument()

    expect(screen.getByRole("link", { name: "Edit itinerary" })).toHaveAttribute("href", "/trips/korea-2026/edit")

    expect(screen.getByRole("heading", { name: "Days" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Arrival/ })).toHaveAttribute("href", "/trips/korea-2026/day/day-1")
    expect(screen.getByRole("link", { name: /Old Seoul/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /KTX south/ })).toBeInTheDocument()
    expect(screen.getByText("Jongno, Ikseon-dong")).toBeInTheDocument()

    const arrivalCard = screen.getByRole("link", { name: /Arrival/ }).parentElement
    expect(arrivalCard).toHaveClass("md:col-span-2")
    expect(screen.getByRole("link", { name: /Old Seoul/ }).parentElement).not.toHaveClass("md:col-span-2")

    expect(screen.getByRole("heading", { name: "Reservations" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /KE012/ })).toHaveAttribute(
      "href",
      "/trips/korea-2026/day/day-1#item-res-flight",
    )
    expect(screen.getByRole("link", { name: /Jungsik/ })).toHaveAttribute(
      "href",
      "/trips/korea-2026/day/day-2#item-res-dinner",
    )
    expect(screen.getByText("Pending")).toBeInTheDocument()

    expect(screen.getByText(/Updated March 3, 2026/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0[12]\b/)
    expect(container.innerHTML).not.toMatch(/uppercase tracking/)
    expect(container.textContent).not.toContain("\u2014")
    expect(container.textContent).not.toContain("\u2013")
  })

  it("hides the editor action for viewers and marks today as the lead cell", async () => {
    const today = todayIsoIn("Asia/Seoul")
    const trip = makeTrip({
      startDate: today,
      endDate: today,
      days: [
        {
          id: "day-now",
          date: today,
          title: "In the city",
          city: "Seoul",
          items: [],
        },
      ],
    })
    mockGetTrip.mockResolvedValue({ trip, access: "view" })
    renderOverview()

    expect(await screen.findByText(/Day 1 of 1/)).toBeInTheDocument()
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0)
    expect(screen.queryByRole("link", { name: "Edit itinerary" })).not.toBeInTheDocument()
    expect(document.querySelector(".trip-row.md\\:col-span-2")).not.toBeNull()
  })

  it("shows a composed empty state when the trip has no days", async () => {
    mockGetTrip.mockResolvedValue({
      trip: makeTrip({ days: [], startDate: "2026-12-01", endDate: "2026-12-04" }),
      access: "owner",
    })
    renderOverview()
    expect(await screen.findByText("No days yet")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Reservations" })).not.toBeInTheDocument()
  })
})
