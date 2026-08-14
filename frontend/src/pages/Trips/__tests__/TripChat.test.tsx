import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { Trip } from "../types"

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

vi.mock("../tripChatApi", () => ({
  streamTripChat: vi.fn(),
}))

import { TripChat } from "../TripChat"

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "tokyo",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [{ id: "day-1", date: "2026-07-10", title: "Arrival", items: [] }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function renderChat(path = "/trips/tokyo") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TripChat />
    </MemoryRouter>,
  )
}

async function openChat() {
  fireEvent.click(await screen.findByRole("button", { name: "Open trip concierge chat" }))
  return screen.findByRole("dialog", { name: "Trip Concierge" })
}

describe("TripChat expand", () => {
  beforeEach(() => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip() })
  })

  afterEach(() => {
    document.body.style.overflow = ""
    vi.clearAllMocks()
  })

  it("stays off the trips index", () => {
    renderChat("/trips")
    expect(screen.queryByRole("button", { name: "Open trip concierge chat" })).toBeNull()
  })

  it("expands and shrinks the open panel", async () => {
    renderChat()
    const dialog = await openChat()
    expect(dialog).toHaveAttribute("data-expanded", "false")
    expect(screen.getByRole("button", { name: "Expand chat" })).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(screen.getByRole("button", { name: "Expand chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "true")
    expect(screen.getByRole("button", { name: "Shrink chat" })).toHaveAttribute("aria-pressed", "true")
    expect(within(dialog).getByPlaceholderText("Ask about this trip…")).toHaveClass("max-h-48")

    fireEvent.click(screen.getByRole("button", { name: "Shrink chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "false")
    expect(within(dialog).getByPlaceholderText("Ask about this trip…")).toHaveClass("max-h-28")
  })

  it("collapses on the first Escape, then closes", async () => {
    renderChat()
    const dialog = await openChat()
    fireEvent.click(screen.getByRole("button", { name: "Expand chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "true")

    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => {
      expect(dialog).toHaveAttribute("data-expanded", "false")
    })
    expect(screen.getByRole("dialog", { name: "Trip Concierge" })).toBeTruthy()

    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Trip Concierge" })).toBeNull()
    })
  })

  it("resets expanded when the panel is closed", async () => {
    renderChat()
    await openChat()
    fireEvent.click(screen.getByRole("button", { name: "Expand chat" }))
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }))

    const dialog = await openChat()
    expect(dialog).toHaveAttribute("data-expanded", "false")
  })
})
