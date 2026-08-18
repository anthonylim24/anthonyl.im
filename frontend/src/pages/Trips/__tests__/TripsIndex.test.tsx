import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { TripSummary } from "../types"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  clerkEnabled: true,
}))

vi.mock("motion/react", async () => {
  const React = await import("react")
  const makeEl = (tag: string) =>
    ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const {
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _tr,
        whileInView: _wiv,
        viewport: _vp,
        layout: _l,
        whileHover: _wh,
        whileTap: _wt,
        layoutId: _li,
        ...domProps
      } = rest
      return React.createElement(tag, domProps, children)
    }
  const cache: Record<string, ReturnType<typeof makeEl>> = {}
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (!cache[prop]) cache[prop] = makeEl(prop)
          return cache[prop]
        },
      },
    ),
    useReducedMotion: () => true,
  }
})

const mockListTrips = vi.fn()
const mockDeleteTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  listTrips: (...args: unknown[]) => mockListTrips(...args),
  deleteTrip: (...args: unknown[]) => mockDeleteTrip(...args),
}))

import { todayIsoIn } from "../theme"
import { TripsIndex } from "../TripsIndex"

function addUtcDays(iso: string, days: number): string {
  const next = new Date(`${iso}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function currentWindow(): { startDate: string; endDate: string } {
  const today = todayIsoIn(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  return { startDate: addUtcDays(today, -2), endDate: addUtcDays(today, 5) }
}

function makeSummary(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "trip-1",
    slug: "tokyo",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    sharedWithAllUsers: false,
    dayCount: 3,
    itemCount: 4,
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

beforeEach(() => {
  mockListTrips.mockReset()
  mockDeleteTrip.mockReset()
  mockGetToken.mockResolvedValue("test-token")
})

describe("TripsIndex", () => {
  it("removes a trip after a successful delete", async () => {
    mockListTrips.mockResolvedValue([
      makeSummary(),
      makeSummary({ id: "trip-2", slug: "osaka", name: "Osaka Bites" }),
    ])
    mockDeleteTrip.mockResolvedValue(undefined)

    renderIndex()

    expect(await screen.findByRole("heading", { name: "Tokyo Long Weekend" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Osaka Bites" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Delete Tokyo Long Weekend" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(mockDeleteTrip).toHaveBeenCalledWith(expect.any(Function), "trip-1")
    })
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Tokyo Long Weekend" })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("heading", { name: "Osaka Bites" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Deleted Tokyo Long Weekend.")
  })

  it("restores the row and shows an error when delete fails", async () => {
    mockListTrips.mockResolvedValue([makeSummary()])
    mockDeleteTrip.mockRejectedValue(new Error("owners only"))

    renderIndex()

    expect(await screen.findByRole("heading", { name: "Tokyo Long Weekend" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Delete Tokyo Long Weekend" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t delete Tokyo Long Weekend")
    expect(screen.getByRole("alert")).toHaveTextContent("owners only")
    expect(screen.getByRole("button", { name: "Retry delete" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(await screen.findByRole("heading", { name: "Tokyo Long Weekend" })).toBeInTheDocument()
  })

  it("puts an in-progress trip in Now, not a magazine hero", async () => {
    mockListTrips.mockResolvedValue([
      makeSummary({ id: "now", slug: "seoul-now", name: "Seoul Now", ...currentWindow() }),
      makeSummary({ id: "trip-2", slug: "osaka", name: "Osaka Bites" }),
    ])

    renderIndex()

    expect(await screen.findByRole("heading", { name: "Seoul Now" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Now" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open Seoul Now" })).toHaveAttribute("href", "/trips/seoul-now")
    expect(screen.queryByRole("heading", { name: /In progress/ })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Upcoming/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Osaka Bites" })).toBeInTheDocument()
  })

  it("deletes an in-progress trip from Now", async () => {
    mockListTrips.mockResolvedValue([makeSummary({ name: "Seoul Now", slug: "seoul-now", ...currentWindow() })])
    mockDeleteTrip.mockResolvedValue(undefined)

    renderIndex()

    expect(await screen.findByRole("heading", { name: "Seoul Now" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete Seoul Now" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(mockDeleteTrip).toHaveBeenCalledWith(expect.any(Function), "trip-1")
    })
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Seoul Now" })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("status")).toHaveTextContent("Deleted Seoul Now.")
  })
})
