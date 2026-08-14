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
const mockUpdateTrip = vi.fn()
const mockStreamTripChat = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
}))

vi.mock("../tripChatApi", () => ({
  streamTripChat: (...args: unknown[]) => mockStreamTripChat(...args),
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
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    mockUpdateTrip.mockResolvedValue(makeTrip())
    mockStreamTripChat.mockResolvedValue({ content: "ok" })
  })

  afterEach(() => {
    document.body.style.overflow = ""
    window.matchMedia = originalMatchMedia
    vi.clearAllMocks()
  })

  it.each(["/trips", "/trips/"])("stays off the trips index: %s", (path) => {
    renderChat(path)
    expect(screen.queryByRole("button", { name: "Open trip concierge chat" })).toBeNull()
  })

  it("expands and shrinks the open panel", async () => {
    renderChat()
    const dialog = await openChat()
    expect(dialog).toHaveAttribute("data-expanded", "false")
    expect(screen.getByRole("button", { name: "Expand chat" })).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(screen.getByRole("button", { name: "Expand chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "true")
    expect(dialog.className).toContain("trip-chat-panel-expanded")
    expect(dialog.className).not.toMatch(/md:h-\[calc\(100dvh/)
    expect(screen.getByRole("button", { name: "Shrink chat" })).toHaveAttribute("aria-pressed", "true")
    const composer = within(dialog).getByPlaceholderText("Ask about this trip…")
    expect(composer).toBeVisible()
    expect(composer).toHaveClass("max-h-48")

    fireEvent.click(screen.getByRole("button", { name: "Shrink chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "false")
    expect(within(dialog).getByPlaceholderText("Ask about this trip…")).toHaveClass("max-h-28")
  })

  it("pins an expanded desktop panel with inset styles", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("768"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    })

    const initialOverflow = document.body.style.overflow
    renderChat()
    const dialog = await openChat()
    expect(document.body.style.overflow).toBe(initialOverflow)

    fireEvent.click(screen.getByRole("button", { name: "Expand chat" }))
    await waitFor(() => {
      expect(dialog).toHaveStyle({ top: "16px", bottom: "16px", height: "auto" })
    })
    expect(document.body.style.overflow).toBe("hidden")
    expect(dialog.className).not.toMatch(/h-\[min\(92dvh/)
    expect(within(dialog).getByPlaceholderText("Ask about this trip…")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Shrink chat" }))
    await waitFor(() => {
      expect(document.body.style.overflow).toBe(initialOverflow)
    })
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

  it("locks page scroll when an open compact chat crosses to mobile", async () => {
    let matches = true
    let onChange: (() => void) | undefined
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        get matches() {
          return query.includes("768") ? matches : !matches
        },
        media: query,
        addEventListener: (_event: string, cb: () => void) => {
          onChange = cb
        },
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    })

    const initialOverflow = document.body.style.overflow
    renderChat()
    await openChat()
    await waitFor(() => {
      expect(document.body.style.overflow).toBe(initialOverflow)
    })

    matches = false
    onChange?.()
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("hidden")
    })

    fireEvent.click(screen.getByRole("button", { name: "Close chat" }))
    await waitFor(() => {
      expect(document.body.style.overflow).toBe(initialOverflow)
    })
  })
})

describe("TripChat errors", () => {
  beforeEach(() => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    mockStreamTripChat.mockResolvedValue({ content: "ok" })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows an inline error with retry after a failed reply", async () => {
    mockStreamTripChat
      .mockRejectedValueOnce(new Error("The concierge lost its connection. Please try again."))
      .mockImplementationOnce(
        async (
          _id: unknown,
          _prompt: unknown,
          _hist: unknown,
          _day: unknown,
          _token: unknown,
          onUpdate: (content: string) => void,
        ) => {
          onUpdate("Here is a plan.")
          return { content: "Here is a plan." }
        },
      )
    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "plan?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("The concierge lost its connection.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Here is a plan.")).toBeTruthy()
    expect(mockStreamTripChat).toHaveBeenCalledTimes(2)
  })
})

describe("TripChat add place", () => {
  beforeEach(() => {
    mockGetTrip.mockResolvedValue({ trip: makeTrip(), access: "owner" })
    mockUpdateTrip.mockImplementation(async (_token: unknown, _id: unknown, patch: { days: Trip["days"] }) =>
      makeTrip({ days: patch.days }),
    )
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) => {
        onUpdate("Try Ichiran.")
        return {
          content: "Try Ichiran.",
          places: [{ name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7, category: "restaurant" }],
        }
      },
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("adds a suggested place to the itinerary", async () => {
    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "ramen?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByRole("button", { name: "Add Ichiran to the itinerary" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add Ichiran to the itinerary" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalled())
    const patch = mockUpdateTrip.mock.calls[0]![2] as { days: Trip["days"] }
    expect(patch.days[0]!.items.some((item) => item.title === "Ichiran")).toBe(true)
    expect(await screen.findByRole("button", { name: "Ichiran added" })).toBeDisabled()
  })
})
