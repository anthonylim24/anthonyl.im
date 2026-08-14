import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { Trip } from "../types"
import { ACCENT_LABEL, TRIP_ACCENTS } from "../theme"

const { mockCreateTrip, mockUpdateTrip, mockGenerate, mockNavigate, mockGetToken } = vi.hoisted(() => ({
  mockCreateTrip: vi.fn(),
  mockUpdateTrip: vi.fn(),
  mockGenerate: vi.fn(),
  mockNavigate: vi.fn(),
  mockGetToken: vi.fn().mockResolvedValue("token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
}))

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../tripsApi", () => ({
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  generateItinerary: (...args: unknown[]) => mockGenerate(...args),
}))

vi.mock("../components/DateRangeField", () => ({
  DateRangeField: ({
    startDate,
    endDate,
    onChange,
    invalid,
    describedBy,
  }: {
    startDate: string
    endDate: string
    onChange: (s: string, e: string) => void
    invalid?: boolean
    describedBy?: string
  }) => (
    <button
      type="button"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onClick={() => onChange("2026-07-10", "2026-07-12")}
    >
      {startDate && endDate ? `${startDate} to ${endDate}` : "Select trip dates"}
    </button>
  ),
}))

vi.mock("../components/TimezoneField", () => ({
  TimezoneField: ({
    value,
    onChange,
    invalid,
    describedBy,
  }: {
    value: string
    onChange: (tz: string) => void
    invalid?: boolean
    describedBy?: string
  }) => (
    <input
      aria-label="Time zone"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

import { TripCreate } from "../TripCreate"

function makeTrip(): Trip {
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
      { id: "d1", date: "2026-07-10", items: [{ id: "i1", kind: "place", title: "Senso-ji", status: "none", createdBy: "ai" }] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function renderCreate(path = "/trips/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/new" element={<TripCreate />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripCreate", () => {
  beforeEach(() => {
    mockCreateTrip.mockReset().mockResolvedValue(makeTrip())
    mockUpdateTrip.mockReset().mockResolvedValue(makeTrip())
    mockGenerate.mockReset().mockResolvedValue({ trip: makeTrip() })
    mockNavigate.mockReset()
  })

  it("shows an asymmetric two-path chooser when mode is unset", () => {
    renderCreate("/trips/new")
    expect(screen.getByRole("heading", { name: "How should we start?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Plan with AI/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Start blank/ })).toBeInTheDocument()
    expect(screen.queryByLabelText("Trip name")).not.toBeInTheDocument()
  })

  it("opens the AI form from the chooser and from ?mode=ai", async () => {
    const user = userEvent.setup()
    renderCreate("/trips/new")
    await user.click(screen.getByRole("button", { name: /Plan with AI/ }))
    expect(screen.getByLabelText("Trip name")).toBeInTheDocument()
    expect(screen.getByLabelText("AI brief (optional)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create & generate" })).toBeInTheDocument()
  })

  it("opens the blank form from ?mode=blank without AI fields", () => {
    renderCreate("/trips/new?mode=blank")
    expect(screen.getByLabelText("Trip name")).toBeInTheDocument()
    expect(screen.queryByLabelText("AI brief (optional)")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create trip" })).toBeInTheDocument()
  })

  it("keeps labels above fields, helpers in markup, and errors below after submit", async () => {
    const user = userEvent.setup()
    renderCreate("/trips/new?mode=blank")

    expect(screen.getByText("A short name collaborators will recognize.")).toBeInTheDocument()
    expect(screen.getByText("Comma-separated. First destination usually sets the planning center of gravity.")).toBeInTheDocument()
    expect(screen.getByText("First and last day of the trip.")).toBeInTheDocument()
    expect(screen.getByText("Use the destination’s time zone.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Create trip" }))
    expect(screen.getByText("Give the trip a name.")).toBeInTheDocument()
    expect(screen.getByText("Name at least one destination.")).toBeInTheDocument()
    expect(screen.getByText("Pick the first and last day.")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Still need")
    expect(mockCreateTrip).not.toHaveBeenCalled()
  })

  it("names every accent swatch and persists the chosen accent after create", async () => {
    const user = userEvent.setup()
    renderCreate("/trips/new?mode=blank")

    for (const key of TRIP_ACCENTS) {
      expect(screen.getByRole("radio", { name: ACCENT_LABEL[key] })).toBeInTheDocument()
    }
    await user.click(screen.getByRole("radio", { name: "Iris" }))
    await user.type(screen.getByLabelText("Trip name"), "Tokyo Long Weekend")
    await user.type(screen.getByLabelText("Destinations"), "Tokyo")
    await user.click(screen.getByRole("button", { name: "Select trip dates" }))
    await user.click(screen.getByRole("button", { name: "Create trip" }))

    await waitFor(() => {
      expect(mockCreateTrip).toHaveBeenCalled()
    })
    expect(mockUpdateTrip).toHaveBeenCalledWith(expect.any(Function), "trip-1", {
      appearance: { accent: "violet" },
    })
    expect(mockNavigate).toHaveBeenCalledWith("/trips/trip-1/edit")
  })

  it("generates an AI itinerary after create", async () => {
    const user = userEvent.setup()
    renderCreate("/trips/new?mode=ai")
    await user.type(screen.getByLabelText("Trip name"), "Tokyo Long Weekend")
    await user.type(screen.getByLabelText("Destinations"), "Tokyo")
    await user.click(screen.getByRole("button", { name: "Select trip dates" }))
    await user.click(screen.getByRole("button", { name: "Create & generate" }))

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled()
    })
    expect(mockNavigate).toHaveBeenCalledWith("/trips/trip-1")
  })

  it("returns to the chooser from the form", async () => {
    const user = userEvent.setup()
    renderCreate("/trips/new?mode=ai")
    await user.click(screen.getByRole("button", { name: "Choose a different start" }))
    expect(screen.getByRole("heading", { name: "How should we start?" })).toBeInTheDocument()
  })
})
