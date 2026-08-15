import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ItineraryItem, Trip } from "../types"

const mockGetTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
}))

import { emitTripChanged } from "../tripsEvents"
import { useLoadedTrip } from "../useLoadedTrip"

const ICHIRAN: ItineraryItem = {
  id: "p1",
  kind: "place",
  title: "Ichiran",
  status: "none",
  createdBy: "ai",
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "tokyo",
    ownerId: "u1",
    name: "Tokyo",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [{ id: "day-1", date: "2026-07-10", items: [] }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

const getToken = async () => "token"

function Probe({ tripId }: { tripId: string }) {
  const { state, reload } = useLoadedTrip(tripId, getToken)
  if (state.status === "loading") {
    return (
      <div>
        <div>loading</div>
        <button type="button" onClick={reload}>
          reload
        </button>
      </div>
    )
  }
  if (state.status === "error") return <div>{`error:${state.message}`}</div>
  const firstItem = state.trip.days[0]?.items[0]
  return (
    <div>
      <div>{`success:${state.trip.id}:${state.trip.updatedAt}:${firstItem?.id ?? "none"}`}</div>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  )
}

describe("useLoadedTrip", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("keeps a concierge add that lands while getTrip is in flight", async () => {
    let resolveGet!: (value: { trip: Trip; access: string }) => void
    mockGetTrip.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      }),
    )

    render(<Probe tripId="tokyo" />)
    expect(screen.getByText("loading")).toBeTruthy()
    await waitFor(() => expect(mockGetTrip).toHaveBeenCalled())

    const stale = makeTrip({ updatedAt: "2026-01-01T00:00:00Z" })
    const live = makeTrip({
      updatedAt: "2026-01-01T00:00:01Z",
      days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
    })

    act(() => emitTripChanged(live))
    await act(async () => {
      resolveGet({ trip: stale, access: "owner" })
    })

    await waitFor(() => {
      expect(screen.getByText("success:tokyo:2026-01-01T00:00:01Z:p1")).toBeTruthy()
    })
  })

  it("applies a later trip-changed event after load", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    render(<Probe tripId="tokyo" />)
    await waitFor(() => {
      expect(screen.getByText("success:tokyo:2026-01-01T00:00:00Z:none")).toBeTruthy()
    })

    act(() =>
      emitTripChanged(
        makeTrip({
          updatedAt: "2026-01-01T00:00:02Z",
          days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
        }),
      ),
    )

    expect(screen.getByText("success:tokyo:2026-01-01T00:00:02Z:p1")).toBeTruthy()
  })

  it("keeps a concierge add across reload when getTrip is stale", async () => {
    mockGetTrip.mockResolvedValueOnce({ trip: makeTrip(), access: "owner" })
    render(<Probe tripId="tokyo" />)
    await waitFor(() => {
      expect(screen.getByText("success:tokyo:2026-01-01T00:00:00Z:none")).toBeTruthy()
    })

    const live = makeTrip({
      updatedAt: "2026-01-01T00:00:01Z",
      days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
    })
    act(() => emitTripChanged(live))
    expect(screen.getByText("success:tokyo:2026-01-01T00:00:01Z:p1")).toBeTruthy()

    let resolveGet!: (value: { trip: Trip; access: string }) => void
    mockGetTrip.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "reload" }))
    // Reload is a transition: keep the current dossier visible (no skeleton flash).
    expect(screen.getByText("success:tokyo:2026-01-01T00:00:01Z:p1")).toBeTruthy()
    expect(screen.queryByText("loading")).toBeNull()

    await act(async () => {
      resolveGet({ trip: makeTrip(), access: "owner" })
    })
    await waitFor(() => {
      expect(screen.getByText("success:tokyo:2026-01-01T00:00:01Z:p1")).toBeTruthy()
    })
  })

  it("does not carry a live tokyo add onto osaka", async () => {
    let resolveOsaka!: (value: { trip: Trip; access: string }) => void
    mockGetTrip.mockImplementation(async (_token: unknown, id: string) => {
      if (id === "osaka") {
        return new Promise((resolve) => {
          resolveOsaka = resolve
        })
      }
      return { trip: makeTrip({ id }), access: "owner" }
    })
    const { rerender } = render(<Probe tripId="tokyo" />)
    await waitFor(() => {
      expect(screen.getByText("success:tokyo:2026-01-01T00:00:00Z:none")).toBeTruthy()
    })

    act(() =>
      emitTripChanged(
        makeTrip({
          updatedAt: "2026-01-01T00:00:01Z",
          days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
        }),
      ),
    )
    expect(screen.getByText("success:tokyo:2026-01-01T00:00:01Z:p1")).toBeTruthy()

    rerender(<Probe tripId="osaka" />)
    await waitFor(() => {
      expect(screen.getByText("loading")).toBeTruthy()
    })
    expect(screen.queryByText(/success:tokyo/)).toBeNull()

    await act(async () => {
      resolveOsaka({ trip: makeTrip({ id: "osaka" }), access: "owner" })
    })
    await waitFor(() => {
      expect(screen.getByText("success:osaka:2026-01-01T00:00:00Z:none")).toBeTruthy()
    })
  })
})
