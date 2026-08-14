import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type { TripSummary } from "../types"
import { todayIsoIn } from "../theme"

const { mockListTrips, mockDeleteTrip, mockNavigate, mockGetToken } = vi.hoisted(() => ({
  mockListTrips: vi.fn(),
  mockDeleteTrip: vi.fn(),
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
  listTrips: (...args: unknown[]) => mockListTrips(...args),
  deleteTrip: (...args: unknown[]) => mockDeleteTrip(...args),
}))

import { TripsIndex } from "../TripsIndex"

function addDays(iso: string, delta: number): string {
  const ms = new Date(`${iso}T00:00:00Z`).getTime() + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function makeSummary(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "t1",
    slug: "tokyo",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo", "Hakone"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "active",
    tags: [],
    collaborators: [],
    sharedWithAllUsers: false,
    dayCount: 3,
    itemCount: 8,
    access: "owner",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function renderIndex() {
  return render(
    <MemoryRouter>
      <TripsIndex />
    </MemoryRouter>,
  )
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

describe("TripsIndex", () => {
  beforeEach(() => {
    mockListTrips.mockReset()
    mockDeleteTrip.mockReset()
    mockNavigate.mockReset()
  })

  it("shows a row-shaped loading skeleton", () => {
    mockListTrips.mockReturnValue(new Promise(() => {}))
    renderIndex()
    expect(screen.getByRole("status", { name: "Loading trips" })).toBeInTheDocument()
  })

  it("shows an inline error with retry", async () => {
    let fail = true
    mockListTrips.mockImplementation(() =>
      fail ? Promise.reject(new Error("offline")) : Promise.resolve([]),
    )
    renderIndex()
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load your trips")
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("heading", { name: "Where to next?" })).toBeInTheDocument()
  })

  it("renders the empty state with two distinct CTAs and the desk photo", async () => {
    mockListTrips.mockResolvedValue([])
    renderIndex()
    expect(await screen.findByRole("heading", { name: "Where to next?" })).toBeInTheDocument()
    const photo = screen.getByRole("img", {
      name: "A travel-planning desk with unfolded maps, a notebook, and boarding passes under a desk lamp.",
    })
    expect(photo).toHaveAttribute("src", "/media/trip-start.webp")
    expect(screen.getByRole("link", { name: "Plan with AI" })).toHaveAttribute("href", "/trips/new?mode=ai")
    expect(screen.getByRole("link", { name: "Start blank" })).toHaveAttribute("href", "/trips/new?mode=blank")
  })

  it("buckets trips, summarizes them, and uses T- for upcoming marks", async () => {
    const today = todayIsoIn(tz)
    mockListTrips.mockResolvedValue([
      makeSummary({
        id: "current",
        slug: "now",
        name: "Seoul Now",
        startDate: addDays(today, -2),
        endDate: addDays(today, 4),
        dayCount: 7,
      }),
      makeSummary({
        id: "soon",
        slug: "soon",
        name: "Osaka Soon",
        startDate: addDays(today, 8),
        endDate: addDays(today, 12),
        dayCount: 5,
      }),
      makeSummary({
        id: "past",
        slug: "past",
        name: "Kyoto Then",
        startDate: addDays(today, -40),
        endDate: addDays(today, -30),
        dayCount: 11,
      }),
    ])
    renderIndex()

    expect(await screen.findByRole("heading", { name: "Trips" })).toBeInTheDocument()
    expect(screen.getByText("3 trips, 1 under way")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /In progress/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Upcoming/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Past/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open Seoul Now" })).toHaveAttribute("href", "/trips/now")
    expect(screen.getByText("T-8")).toBeInTheDocument()
    expect(screen.getAllByText("Tokyo, Hakone").length).toBeGreaterThan(0)
    expect(screen.queryByText(/ · /)).not.toBeInTheDocument()
  })

  it("uses a card grid for three or more past trips and rows when there are fewer", async () => {
    const today = todayIsoIn(tz)
    const past = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeSummary({
          id: `past-${i}`,
          slug: `past-${i}`,
          name: `Past ${i}`,
          startDate: addDays(today, -40 - i * 10),
          endDate: addDays(today, -30 - i * 10),
        }),
      )

    mockListTrips.mockResolvedValue(past(2))
    const first = renderIndex()
    expect(await screen.findByRole("link", { name: "Open Past 0" })).toBeInTheDocument()
    expect(first.container.querySelector(".grid")).toBeNull()
    first.unmount()

    mockListTrips.mockResolvedValue(past(3))
    const second = renderIndex()
    expect(await screen.findByRole("link", { name: "Open Past 0" })).toBeInTheDocument()
    expect(second.container.querySelector(".sm\\:grid-cols-2")).toBeTruthy()
  })

  it("opens a delete confirm strip with a focus trap and restores focus on cancel", async () => {
    const user = userEvent.setup()
    const today = todayIsoIn(tz)
    mockListTrips.mockResolvedValue([
      makeSummary({
        id: "soon",
        name: "Osaka Soon",
        startDate: addDays(today, 8),
        endDate: addDays(today, 12),
      }),
    ])
    renderIndex()
    const del = await screen.findByRole("button", { name: "Delete Osaka Soon" })
    await user.click(del)

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveTextContent("Osaka Soon")
    const cancel = screen.getByRole("button", { name: "Cancel" })
    const confirm = screen.getByRole("button", { name: "Delete" })
    expect(cancel).toHaveFocus()

    confirm.focus()
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(confirm).toHaveFocus()

    await user.click(cancel)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete Osaka Soon" })).toHaveFocus()
    })
  })

  it("shows a retry strip when delete fails", async () => {
    const user = userEvent.setup()
    const today = todayIsoIn(tz)
    mockListTrips.mockResolvedValue([
      makeSummary({
        id: "soon",
        name: "Osaka Soon",
        startDate: addDays(today, 8),
        endDate: addDays(today, 12),
      }),
    ])
    mockDeleteTrip.mockRejectedValue(new Error("locked"))
    renderIndex()

    await user.click(await screen.findByRole("button", { name: "Delete Osaka Soon" }))
    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t delete")
    expect(screen.getByRole("button", { name: "Retry delete" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument()
  })

  it("announces a successful delete and moves focus to New trip", async () => {
    const user = userEvent.setup()
    const today = todayIsoIn(tz)
    mockListTrips.mockResolvedValue([
      makeSummary({
        id: "soon",
        name: "Osaka Soon",
        startDate: addDays(today, 8),
        endDate: addDays(today, 12),
      }),
    ])
    mockDeleteTrip.mockResolvedValue({ ok: true })
    renderIndex()

    await user.click(await screen.findByRole("button", { name: "Delete Osaka Soon" }))
    mockListTrips.mockResolvedValue([])
    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("Deleted Osaka Soon.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New trip" })).toHaveFocus()
  })

  it("navigates to /trips/new from the New trip action", async () => {
    const user = userEvent.setup()
    mockListTrips.mockResolvedValue([])
    renderIndex()
    await screen.findByRole("heading", { name: "Where to next?" })
    await user.click(screen.getByRole("button", { name: "New trip" }))
    expect(mockNavigate).toHaveBeenCalledWith("/trips/new")
  })

  it("keeps a live-state mark only on a trip that is under way", async () => {
    const today = todayIsoIn(tz)
    mockListTrips.mockResolvedValue([
      makeSummary({
        id: "current",
        name: "Seoul Now",
        startDate: addDays(today, -1),
        endDate: addDays(today, 3),
        dayCount: 5,
      }),
      makeSummary({
        id: "soon",
        name: "Osaka Soon",
        startDate: addDays(today, 8),
        endDate: addDays(today, 12),
      }),
    ])
    renderIndex()
    expect(await screen.findByText("Under way, day 2 of 5")).toBeInTheDocument()
    expect(screen.getByText("8 days until departure")).toBeInTheDocument()
    expect(screen.getByText("Day 2")).toBeInTheDocument()
    expect(screen.getByText("T-8")).toBeInTheDocument()
  })
})
