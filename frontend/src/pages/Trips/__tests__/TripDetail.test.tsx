import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Link, MemoryRouter, Route, Routes } from "react-router-dom"
import type { EnhancementRun, ItineraryItem, Trip } from "../types"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  clerkEnabled: true,
}))

const mockGetTrip = vi.fn()
const mockUpdateTrip = vi.fn()
const mockEnhanceTrip = vi.fn()
const mockApplySuggestions = vi.fn()
const mockGenerateItinerary = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  enhanceTrip: (...args: unknown[]) => mockEnhanceTrip(...args),
  applySuggestions: (...args: unknown[]) => mockApplySuggestions(...args),
  generateItinerary: (...args: unknown[]) => mockGenerateItinerary(...args),
}))

vi.mock("../ExtractedPlacesLibrary", () => ({
  ExtractedPlacesLibrary: () => null,
}))

import { TripDetail } from "../TripDetail"

const SENSO: ItineraryItem = {
  id: "it-a",
  kind: "place",
  title: "Senso-ji",
  status: "none",
  location: { name: "Senso-ji", lat: 35.71, lng: 139.8, source: "user" },
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
      { id: "day-1", date: "2026-07-10", title: "Arrival", items: [SENSO] },
      { id: "day-2", date: "2026-07-11", title: "Tsukiji", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeRun(trip: Trip, applied: string[] = ["sug-add"]): EnhancementRun {
  return {
    id: "run-1",
    tripId: trip.id,
    scope: "trip",
    status: "complete",
    outcome: "added_places",
    outcomeReason: "Day 2 had no meals, so lunch at Ichiran was added.",
    appliedSuggestionIds: applied,
    suggestions: [
      {
        id: "sug-add",
        kind: "add",
        dayId: "day-2",
        title: "Add lunch",
        detail: "No meals on day 2.",
        confidence: "high",
        proposedItem: {
          id: "it-new",
          kind: "place",
          title: "Ichiran",
          status: "needs_review",
          location: { name: "Ichiran", lat: 35.66, lng: 139.7, source: "ai" },
          createdBy: "ai",
        },
      },
    ],
    createdAt: "2026-06-01T00:00:00.000Z",
  }
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/trips/trip-1/edit"]}>
      <Routes>
        <Route path="/trips/:tripId/edit" element={<TripDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripDetail enhance", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
    mockUpdateTrip.mockReset()
    mockEnhanceTrip.mockReset()
    mockApplySuggestions.mockReset()
    mockGenerateItinerary.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("flushes pending edits before enhance and does not PATCH stale days afterward", async () => {
    const trip = makeTrip()
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })
    mockUpdateTrip.mockImplementation(
      async (_token: unknown, _id: unknown, patch: { name?: string; days?: Trip["days"] }) => ({
        ...trip,
        ...patch,
      }),
    )

    const enhanced = makeTrip({
      name: "Tokyo Rewrite",
      days: [
        trip.days[0]!,
        {
          ...trip.days[1]!,
          items: [
            {
              id: "it-new",
              kind: "place",
              title: "Ichiran",
              status: "needs_review",
              location: { name: "Ichiran", lat: 35.66, lng: 139.7, source: "ai" },
              createdBy: "ai",
            },
          ],
        },
      ],
    })
    mockEnhanceTrip.mockResolvedValue({ run: makeRun(enhanced), trip: enhanced, applied: ["sug-add"] })

    renderEditor()
    const name = await screen.findByLabelText("Trip name")
    fireEvent.change(name, { target: { value: "Tokyo Rewrite" } })
    await waitFor(() => expect(name).toHaveValue("Tokyo Rewrite"))

    fireEvent.click(screen.getByRole("button", { name: "Enhance trip" }))

    await waitFor(() => {
      const flushed = mockUpdateTrip.mock.calls
        .map((call) => call[2] as { name?: string })
        .find((patch) => patch.name === "Tokyo Rewrite")
      expect(flushed?.name).toBe("Tokyo Rewrite")
    })

    await waitFor(() => {
      expect(screen.getAllByText(/lunch at Ichiran/i).length).toBeGreaterThan(0)
    })
    expect(mockEnhanceTrip).toHaveBeenCalled()
  })

  it("keeps pending edits and skips enhance when the flush PATCH fails", async () => {
    const trip = makeTrip()
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })
    mockUpdateTrip.mockRejectedValue(new Error("network down"))

    renderEditor()
    const name = await screen.findByLabelText("Trip name")
    fireEvent.change(name, { target: { value: "Tokyo Rewrite" } })
    await waitFor(() => expect(name).toHaveValue("Tokyo Rewrite"))

    fireEvent.click(screen.getByRole("button", { name: "Enhance trip" }))

    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalled())
    expect(mockEnhanceTrip).not.toHaveBeenCalled()
    expect(name).toHaveValue("Tokyo Rewrite")
    expect(screen.getByText(/couldn’t save your latest edits/i)).toBeInTheDocument()
  })

  it("gives a one-day trip the full editor width instead of the nav track", async () => {
    const trip = makeTrip({
      name: "Empty Kyoto Day",
      destinations: ["Kyoto"],
      startDate: "2026-10-02",
      endDate: "2026-10-02",
      days: [
        {
          id: "day-1",
          date: "2026-10-02",
          title: "Higashiyama",
          items: [
            {
              id: "it-fushimi",
              kind: "place",
              title: "Fushimi Inari Taisha",
              time: "08:00",
              status: "needs_review",
              location: { name: "Fushimi Inari Taisha", source: "ai" },
              createdBy: "ai",
            },
          ],
        },
      ],
    })
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })

    renderEditor()
    expect(await screen.findByDisplayValue("Fushimi Inari Taisha")).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: "Days" })).toBeNull()
    expect(screen.getByTestId("trip-itinerary").className).toMatch(/flex-1/)
    expect(screen.getByTestId("trip-itinerary").className).toMatch(/min-w-0/)
  })

  it("keeps day editor chrome mounted while enhance runs", async () => {
    const trip = makeTrip()
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })
    let finish!: (value: { run: EnhancementRun; trip: Trip; applied: string[] }) => void
    mockEnhanceTrip.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    renderEditor()
    await screen.findByLabelText("Trip name")
    expect(screen.getByDisplayValue("Arrival")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Enhance day" })).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: "Enhance trip" }))
    await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalled())

    expect(screen.getByDisplayValue("Arrival")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Enhance day" }).length).toBeGreaterThan(0)
    expect(screen.getByRole("combobox", { name: "Trip status" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()

    fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]!)
    expect(screen.getByPlaceholderText("Samseong, COEX, Bongeunsa")).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: /Appearance/i }))
    expect(screen.getByLabelText("Trip permalink")).toBeDisabled()

    finish({ run: makeRun(trip, []), trip, applied: [] })
    await waitFor(() => expect(screen.getByRole("button", { name: "Enhance trip" })).toBeEnabled())
  })

  it("does not scroll to a day hash when enhance refreshes the trip", async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const trip = makeTrip()
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })
    const enhanced = makeTrip({ name: "Tokyo Rewrite" })
    mockEnhanceTrip.mockResolvedValue({ run: makeRun(enhanced), trip: enhanced, applied: ["sug-add"] })

    render(
      <MemoryRouter initialEntries={["/trips/trip-1/edit#day-2"]}>
        <Routes>
          <Route path="/trips/:tripId/edit" element={<TripDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByLabelText("Trip name")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByRole("button", { name: "Enhance trip" }))
    await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalled())
    await waitFor(() => {
      expect(screen.getAllByText(/lunch at Ichiran/i).length).toBeGreaterThan(0)
    })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("scrolls again when navigating to another trip with the same day hash", async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const tripA = makeTrip({ id: "trip-1" })
    const tripB = makeTrip({ id: "trip-2", name: "Osaka Weekend" })
    mockGetTrip.mockImplementation(async (_token: unknown, id: unknown) => ({
      trip: id === "trip-2" ? tripB : tripA,
      access: "owner" as const,
    }))

    render(
      <MemoryRouter initialEntries={["/trips/trip-1/edit#day-1"]}>
        <Routes>
          <Route
            path="/trips/:tripId/edit"
            element={
              <>
                <Link to="/trips/trip-2/edit#day-1">Open other trip</Link>
                <TripDetail />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByLabelText("Trip name")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByRole("link", { name: "Open other trip" }))
    await screen.findByDisplayValue("Osaka Weekend")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })

  it("shows the 502 run reason instead of a generic failure", async () => {
    const trip = makeTrip()
    mockGetTrip.mockResolvedValue({ trip, access: "owner" })
    mockUpdateTrip.mockResolvedValue(trip)
    mockEnhanceTrip.mockResolvedValue({
      run: {
        ...makeRun(trip, []),
        status: "error",
        outcome: "no_adds_possible",
        outcomeReason: "The AI review failed before it could add places.",
        error: "no JSON",
        suggestions: [],
      },
      error: "enhancement_failed",
      trip,
    })

    renderEditor()
    await screen.findByLabelText("Trip name")
    fireEvent.click(screen.getByRole("button", { name: "Enhance trip" }))
    await waitFor(() => expect(mockEnhanceTrip).toHaveBeenCalled())
    await waitFor(() => {
      expect(screen.getAllByText(/failed before it could add places/i).length).toBeGreaterThan(0)
    })
  })
})
