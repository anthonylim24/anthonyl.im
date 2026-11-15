import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { TripConflictError } from "../tripConflict"
import type { Trip } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

// The concierge's writes name the copy they read (`baseUpdatedAt`). When the
// editor's autosave lands in between, the server answers 409 and the
// concierge reads again and re-applies its change, once.

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => async () => "test-token",
  useAuthReady: () => true,
  clerkEnabled: true,
}))

const mockGetTrip = vi.fn()
const mockUpdateTrip = vi.fn()
const mockStreamTripChat = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
}))
vi.mock("../tripChatApi", () => ({
  streamTripChat: (...args: unknown[]) => mockStreamTripChat(...args),
}))
vi.mock("../placePhoto", () => ({
  lookupPhoto: vi.fn().mockResolvedValue(null),
  lookupGooglePlacePhoto: vi.fn().mockResolvedValue(null),
}))

import { TripChat } from "../TripChat"

type Handlers = { onText: (content: string) => void }

const ICHIRAN = { ref: "ChIJichiran", name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7, category: "restaurant", dayId: "day-1", time: "12:30" }

const temple = makeItem({ id: "temple", title: "Senso-ji", time: "10:00" })
const edited = makeItem({ id: "edited", title: "Added in the editor", time: "18:00" })

function tokyo(overrides: Partial<Trip> = {}): Trip {
  return makeTrip({
    id: "tokyo",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    days: [{ id: "day-1", date: "2026-07-10", title: "Arrival", items: [temple] }],
    ...overrides,
  })
}

describe("TripChat saveDays", () => {
  let stored: Trip

  beforeEach(() => {
    localStorage.clear()
    stored = tokyo()
    mockGetTrip.mockImplementation(async () => ({ trip: stored, access: "owner" }))
    mockStreamTripChat.mockImplementation(async (_request: unknown, _token: unknown, handlers: Handlers) => {
      handlers.onText("Try Ichiran.")
      return { content: "Try Ichiran.", places: [ICHIRAN] }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  async function addIchiran() {
    render(
      <MemoryRouter initialEntries={["/trips/tokyo/day/day-1"]}>
        <TripChat />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Open trip concierge chat" }))
    const dialog = await screen.findByRole("dialog", { name: "Trip Concierge" })
    const box = within(dialog).getByRole("textbox", { name: "Message the concierge" })
    fireEvent.change(box, { target: { value: "ramen?" } })
    fireEvent.keyDown(box, { key: "Enter" })
    const cards = await within(dialog).findByRole("list", { name: "Suggested places" })
    fireEvent.click(within(cards).getByRole("button", { name: /^Add Ichiran to/ }))
  }

  it("names the copy it read, and re-reads and re-applies once on a conflict", async () => {
    mockUpdateTrip
      .mockImplementationOnce(async () => {
        // The editor saved in between: the server now has its stop too.
        stored = tokyo({ updatedAt: "2026-01-02T00:00:00Z", days: [{ ...stored.days[0]!, items: [temple, edited] }] })
        throw new TripConflictError({ message: "conflict", trip: stored })
      })
      .mockImplementationOnce(async (_t: unknown, _id: unknown, patch: { days: Trip["days"] }) => {
        stored = { ...stored, days: patch.days, updatedAt: "2026-01-03T00:00:00Z" }
        return stored
      })
    await addIchiran()

    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(2))
    expect(mockUpdateTrip.mock.calls[0]![2]).toMatchObject({ baseUpdatedAt: "2026-01-01T00:00:00Z" })
    expect(mockUpdateTrip.mock.calls[1]![2]).toMatchObject({ baseUpdatedAt: "2026-01-02T00:00:00Z" })
    expect(stored.days[0]!.items.map((i) => i.title)).toEqual(["Senso-ji", "Ichiran", "Added in the editor"])
  })

  it("gives up after a second conflict instead of looping", async () => {
    mockUpdateTrip.mockRejectedValue(new TripConflictError({ message: "Someone else changed this trip.", trip: stored }))
    await addIchiran()
    // The failure is reported on the reply, after exactly one retry.
    expect(await screen.findByText("Someone else changed this trip.")).toBeInTheDocument()
    expect(mockUpdateTrip).toHaveBeenCalledTimes(2)
  })
})
