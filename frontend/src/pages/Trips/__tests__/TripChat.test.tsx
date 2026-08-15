import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { Trip } from "../types"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
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

vi.mock("../../Korea/placePhoto", () => ({
  lookupPhoto: vi.fn().mockResolvedValue(null),
  lookupGooglePlacePhoto: vi.fn().mockResolvedValue(null),
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

function stubMatchMedia(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: desktop && query.includes("768"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  })
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
    stubMatchMedia(false)
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
      expect(dialog).toHaveAttribute("data-expanded", "true")
    })
    expect(document.body.style.overflow).toBe("hidden")
    expect(dialog.className).toContain("trip-chat-panel-expanded")
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

  it("pins the latest user message and does not follow streamed tokens", async () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo

    let pushToken: ((content: string) => void) | undefined
    let finish: ((value: { content: string }) => void) | undefined
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) =>
        new Promise<{ content: string }>((resolve) => {
          pushToken = onUpdate
          finish = resolve
        }),
    )

    try {
      renderChat()
      await openChat()
      scrollTo.mockClear()

      fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "lunch?" } })
      fireEvent.click(screen.getByRole("button", { name: "Send message" }))

      expect(await screen.findByText("lunch?")).toBeTruthy()
      expect(document.querySelector("[data-transcript-anchor='latest-user']")).toHaveTextContent("lunch?")
      expect(document.querySelector("[data-transcript-spacer]")).toBeTruthy()
      const callsAfterSend = scrollTo.mock.calls.length
      expect(callsAfterSend).toBeGreaterThan(0)

      pushToken?.("Start at")
      pushToken?.("Start at Gwangjang Market for the first bowl.")
      expect(await screen.findByText(/Gwangjang Market/)).toBeTruthy()
      expect(scrollTo.mock.calls.length).toBe(callsAfterSend)

      finish?.({ content: "Start at Gwangjang Market for the first bowl." })
      expect(await screen.findByText(/Gwangjang Market/)).toBeTruthy()
      expect(scrollTo.mock.calls.length).toBe(callsAfterSend)
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })

  it("shows a looking-up state while the reply streams", async () => {
    let release: ((value: { content: string }) => void) | undefined
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) =>
        new Promise<{ content: string }>((resolve) => {
          release = (value) => {
            onUpdate(value.content)
            resolve(value)
          }
        }),
    )
    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "lunch?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText("Looking this up…")).toBeTruthy()
    release?.({ content: "Try the market." })
    expect(await screen.findByText("Try the market.")).toBeTruthy()
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
    expect(screen.getByRole("button", { name: "View photos of Ichiran" })).toBeTruthy()
    expect(within(screen.getByRole("dialog", { name: "Trip Concierge" })).getByRole("button", { name: "Send message" })).toHaveClass(
      "h-7",
    )
  })

  it("removes a mentioned itinerary stop after confirm", async () => {
    const withPlace = makeTrip({
      days: [
        {
          id: "day-1",
          date: "2026-07-10",
          title: "Arrival",
          items: [
            {
              id: "p1",
              kind: "place",
              title: "Senso-ji",
              status: "none",
              createdBy: "user",
              location: { name: "Senso-ji", source: "user", lat: 35.7, lng: 139.8 },
            },
          ],
        },
      ],
    })
    mockGetTrip.mockResolvedValue({ trip: withPlace, access: "owner" })
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) => {
        onUpdate("Senso-ji is the quiet start.")
        return { content: "Senso-ji is the quiet start." }
      },
    )
    mockUpdateTrip.mockImplementation(async (_token: unknown, _id: unknown, patch: { days: Trip["days"] }) =>
      makeTrip({ days: patch.days }),
    )

    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "temple?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByRole("button", { name: "Remove Senso-ji from the itinerary" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove Senso-ji from the itinerary" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove Senso-ji" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalled())
    const patch = mockUpdateTrip.mock.calls[0]![2] as { days: Trip["days"] }
    expect(patch.days[0]!.items.some((item) => item.id === "p1")).toBe(false)
  })

  it("confirms a proposed remove move from the model", async () => {
    const withPlace = makeTrip({
      days: [
        {
          id: "day-1",
          date: "2026-07-10",
          title: "Arrival",
          items: [
            {
              id: "p1",
              kind: "place",
              title: "Ichiran",
              status: "none",
              createdBy: "user",
              location: { name: "Ichiran", source: "user", address: "Shibuya" },
            },
          ],
        },
      ],
    })
    mockGetTrip.mockResolvedValue({ trip: withPlace, access: "owner" })
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) => {
        onUpdate("I can take Ichiran off Arrival.")
        return {
          content: "I can take Ichiran off Arrival.",
          moves: [{ type: "remove", name: "Ichiran", dayId: "day-1" }],
        }
      },
    )
    mockUpdateTrip.mockImplementation(async (_token: unknown, _id: unknown, patch: { days: Trip["days"] }) =>
      makeTrip({ days: patch.days }),
    )

    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "drop ichiran" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText("Remove Ichiran from Arrival?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalled())
  })

  it("keeps streamed tokens when the reply is cut off", async () => {
    mockStreamTripChat.mockImplementation(
      async (
        _id: unknown,
        _prompt: unknown,
        _hist: unknown,
        _day: unknown,
        _token: unknown,
        onUpdate: (content: string) => void,
      ) => {
        onUpdate("Start at Gwangjang")
        return {
          content: "Start at Gwangjang",
          error: "The concierge lost its connection. Please try again.",
        }
      },
    )
    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "lunch?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText(/Start at Gwangjang/)).toBeTruthy()
    expect(screen.getByRole("status")).toHaveTextContent(/lost its connection/i)
  })

  it("does not show typing dots when a cutoff has no tokens", async () => {
    mockStreamTripChat.mockResolvedValue({
      content: "",
      error: "The concierge lost its connection. Please try again.",
    })
    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "lunch?" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByRole("status")).toHaveTextContent(/lost its connection/i)
    expect(screen.queryByLabelText("Concierge is typing")).toBeNull()
  })

  it("does not show idle typing dots for a moves-only reply", async () => {
    const withPlace = makeTrip({
      days: [
        {
          id: "day-1",
          date: "2026-07-10",
          title: "Arrival",
          items: [
            {
              id: "p1",
              kind: "place",
              title: "Ichiran",
              status: "none",
              createdBy: "user",
              location: { name: "Ichiran", source: "user", address: "Shibuya" },
            },
          ],
        },
      ],
    })
    mockGetTrip.mockResolvedValue({ trip: withPlace, access: "owner" })
    mockStreamTripChat.mockResolvedValue({
      content: "",
      moves: [{ type: "remove", name: "Ichiran", dayId: "day-1" }],
    })

    renderChat()
    await openChat()
    fireEvent.change(screen.getByPlaceholderText("Ask about this trip…"), { target: { value: "drop ichiran" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText("Remove Ichiran from Arrival?")).toBeTruthy()
    expect(screen.queryByLabelText("Concierge is typing")).toBeNull()
    expect(screen.queryByText("Looking this up…")).toBeNull()
  })
})
