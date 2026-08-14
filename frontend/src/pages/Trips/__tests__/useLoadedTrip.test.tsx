import { act, render, screen, waitFor } from "@testing-library/react"
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
  const { state } = useLoadedTrip(tripId, getToken)
  if (state.status === "loading") return <div>loading</div>
  if (state.status === "error") return <div>{`error:${state.message}`}</div>
  return <div>{`success:${state.trip.updatedAt}:${state.trip.days[0]?.items.length ?? 0}`}</div>
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
      expect(screen.getByText("success:2026-01-01T00:00:01Z:1")).toBeTruthy()
    })
  })

  it("applies a later trip-changed event after load", async () => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    render(<Probe tripId="tokyo" />)
    await waitFor(() => {
      expect(screen.getByText("success:2026-01-01T00:00:00Z:0")).toBeTruthy()
    })

    act(() =>
      emitTripChanged(
        makeTrip({
          updatedAt: "2026-01-01T00:00:02Z",
          days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
        }),
      ),
    )

    expect(screen.getByText("success:2026-01-01T00:00:02Z:1")).toBeTruthy()
  })
})
