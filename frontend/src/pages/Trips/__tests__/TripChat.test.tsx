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

vi.mock("../placePhoto", () => ({
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

    fireEvent.click(screen.getByRole("button", { name: "Shrink chat" }))
    expect(dialog).toHaveAttribute("data-expanded", "false")
    expect(within(dialog).getByPlaceholderText("Ask about this trip…")).toBeVisible()
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

type Handlers = {
  onText: (content: string) => void
  onStatus?: (status: { kind: string; label?: string; detail?: string }) => void
  onPlaces?: (places: unknown[]) => void
}
type Request = { prompt: string; messages: unknown[]; dayId?: string; location?: unknown; signal?: AbortSignal }

const ICHIRAN = {
  ref: "ChIJichiran",
  name: "Ichiran",
  address: "Shibuya",
  lat: 35.66,
  lng: 139.7,
  category: "restaurant",
  dayId: "day-1",
  time: "12:30",
  rating: 4.4,
  hours: "11:00–22:00",
  hoursDay: "Fri",
  open: true,
  walk: { from: "Senso-ji", minutes: 6, meters: 480 },
}

function tripWithStops(): Trip {
  return makeTrip({
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        title: "Arrival",
        items: [
          { id: "temple", kind: "place", title: "Senso-ji", time: "10:00", status: "none", createdBy: "user" },
          { id: "dinner", kind: "place", title: "Sushi Dai", time: "20:30", status: "none", createdBy: "user" },
        ],
      },
    ],
  })
}

async function ask(text: string) {
  const dialog = await openChat()
  const box = within(dialog).getByRole("textbox", { name: "Message the concierge" })
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: "Enter" })
  return dialog
}

describe("TripChat conversation", () => {
  let stored: Trip

  beforeEach(() => {
    localStorage.clear()
    stored = tripWithStops()
    mockGetTrip.mockImplementation(async () => ({ trip: stored, access: "owner" }))
    mockUpdateTrip.mockImplementation(async (_token: unknown, _id: unknown, patch: { days: Trip["days"] }) => {
      stored = { ...stored, days: patch.days }
      return stored
    })
    mockStreamTripChat.mockImplementation(async (_request: Request, _token: unknown, handlers: Handlers) => {
      handlers.onText("Try **Ichiran**.")
      return { content: "Try **Ichiran**.", places: [ICHIRAN], followups: ["How do we get to Ichiran?"] }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("opens on starters drawn from the itinerary and sends the one picked", async () => {
    renderChat("/trips/tokyo/day/day-1")
    const dialog = await openChat()
    const starters = within(dialog).getByRole("list", { name: "Suggested questions" })
    fireEvent.click(within(starters).getByRole("button", { name: "Find lunch near Senso-ji" }))
    await waitFor(() => expect(mockStreamTripChat).toHaveBeenCalled())
    const request = mockStreamTripChat.mock.calls[0]![0] as Request
    expect(request.prompt).toBe("Where should we eat lunch near Senso-ji on Friday?")
    expect(request.dayId).toBe("day-1")
    expect(request.location).toBeUndefined()
  })

  it("shows what the concierge is doing until the words arrive", async () => {
    let finish: (value: { content: string }) => void = () => {}
    mockStreamTripChat.mockImplementation((_request: Request, _token: unknown, handlers: Handlers) => {
      handlers.onStatus?.({ kind: "places", label: "Checking Google Maps", detail: "ramen near Senso-ji" })
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    renderChat()
    const dialog = await ask("ramen?")
    expect(await within(dialog).findByText("Checking Google Maps", { selector: "[data-concierge-status] *" })).toBeTruthy()
    expect(within(dialog).getByText("ramen near Senso-ji")).toBeTruthy()
    // While it works the send button is a stop button.
    expect(within(dialog).getByRole("button", { name: "Stop the reply" })).toBeTruthy()
    finish({ content: "Ichiran." })
    await waitFor(() => expect(dialog.querySelector("[data-concierge-status]")).toBeNull())
    expect(within(dialog).getByRole("button", { name: "Send message" })).toBeTruthy()
  })

  it("adds a suggested place at its time, in clock order, and can undo it", async () => {
    renderChat("/trips/tokyo/day/day-1")
    const dialog = await ask("ramen?")
    const cards = await within(dialog).findByRole("list", { name: "Suggested places" })
    expect(within(cards).getByText("6 min walk from Senso-ji")).toBeTruthy()
    expect(within(cards).getByText("Open Fri 11:00–22:00")).toBeTruthy()
    fireEvent.click(within(cards).getByRole("button", { name: "Add Ichiran to Fri 10 Jul · 12:30" }))

    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1))
    expect(stored.days[0]!.items.map((i) => `${i.time} ${i.title}`)).toEqual(["10:00 Senso-ji", "12:30 Ichiran", "20:30 Sushi Dai"])
    expect(stored.days[0]!.items[1]!.location).toMatchObject({ name: "Ichiran", lat: 35.66, source: "ai" })
    expect(await within(cards).findByText("Added to Fri 10 Jul · 12:30")).toBeTruthy()

    fireEvent.click(within(cards).getByRole("button", { name: "Undo adding Ichiran" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(2))
    expect(stored.days[0]!.items.map((i) => i.title)).toEqual(["Senso-ji", "Sushi Dai"])
    expect(await within(cards).findByRole("button", { name: "Add Ichiran to Fri 10 Jul · 12:30" })).toBeTruthy()
  })

  it("changes nothing until a proposal is applied, then offers Undo", async () => {
    mockStreamTripChat.mockImplementation(async (_request: Request, _token: unknown, handlers: Handlers) => {
      handlers.onText("Apply moves dinner and drops the temple.")
      return {
        content: "Apply moves dinner and drops the temple.",
        proposal: {
          id: "prop-1",
          summary: "Tidy Friday",
          changes: [
            { id: "c1", op: "set_time", dayId: "day-1", itemId: "dinner", title: "Sushi Dai", from: "20:30", time: "19:00" },
            { id: "c2", op: "remove", dayId: "day-1", itemId: "temple", title: "Senso-ji" },
          ],
        },
      }
    })
    renderChat("/trips/tokyo/day/day-1")
    const dialog = await ask("tidy friday")
    const card = await within(dialog).findByRole("region", { name: "Tidy Friday" })
    expect(within(card).getByText("Proposed change · Fri 10 Jul")).toBeTruthy()
    expect(mockUpdateTrip).not.toHaveBeenCalled()

    // Leave the removal out of the batch.
    fireEvent.click(within(card).getByRole("checkbox", { name: "Include: Senso-ji" }))
    fireEvent.click(within(card).getByRole("button", { name: "Apply 1 of 2" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1))
    expect(stored.days[0]!.items.map((i) => `${i.time} ${i.title}`)).toEqual(["10:00 Senso-ji", "19:00 Sushi Dai"])
    expect(await within(card).findByText("Applied · Fri 10 Jul")).toBeTruthy()

    fireEvent.click(within(card).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(2))
    expect(stored.days[0]!.items.map((i) => `${i.time} ${i.title}`)).toEqual(["10:00 Senso-ji", "20:30 Sushi Dai"])
    expect(await within(card).findByRole("button", { name: "Apply again" })).toBeTruthy()
  })

  it("hides Apply from someone who can only view the trip", async () => {
    mockGetTrip.mockImplementation(async () => ({ trip: stored, access: "view" }))
    mockStreamTripChat.mockResolvedValue({
      content: "Here.",
      proposal: { id: "p", summary: "Remove the temple", changes: [{ id: "c1", op: "remove", dayId: "day-1", itemId: "temple", title: "Senso-ji" }] },
    })
    renderChat()
    const dialog = await ask("remove the temple")
    const card = await within(dialog).findByRole("region", { name: "Remove the temple" })
    expect(within(card).queryByRole("button", { name: "Remove it" })).toBeNull()
    expect(within(card).getByText(/Ask an editor/)).toBeTruthy()
  })

  it("sends the cards of earlier replies back with a follow-up", async () => {
    renderChat()
    const dialog = await ask("ramen?")
    fireEvent.click(await within(dialog).findByRole("button", { name: "How do we get to Ichiran?" }))
    await waitFor(() => expect(mockStreamTripChat).toHaveBeenCalledTimes(2))
    const request = mockStreamTripChat.mock.calls[1]![0] as Request
    expect(request.prompt).toBe("How do we get to Ichiran?")
    expect(request.messages).toEqual([
      { role: "user", content: "ramen?" },
      {
        role: "assistant",
        content: "Try **Ichiran**.",
        places: [{ ref: "ChIJichiran", name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7, category: "restaurant", dayId: "day-1", time: "12:30" }],
      },
    ])
  })

  it("offers Try again after a failure and asks the same question", async () => {
    mockStreamTripChat.mockRejectedValueOnce(new Error("The concierge did not respond in time. Please try again."))
    renderChat()
    const dialog = await ask("ramen?")
    const alert = await within(dialog).findByRole("alert")
    expect(alert.textContent).toContain("did not respond in time")
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(mockStreamTripChat).toHaveBeenCalledTimes(2))
    expect((mockStreamTripChat.mock.calls[1]![0] as Request).prompt).toBe("ramen?")
    expect((mockStreamTripChat.mock.calls[1]![0] as Request).messages).toEqual([])
    expect(await within(dialog).findByText("Ichiran", { selector: "strong" })).toBeTruthy()
    expect(within(dialog).queryByRole("alert")).toBeNull()
    expect(within(dialog).getAllByText("ramen?")).toHaveLength(1)
  })

  it("keeps the words that arrived when the reply is cut off", async () => {
    mockStreamTripChat.mockImplementation(async (_request: Request, _token: unknown, handlers: Handlers) => {
      handlers.onText("Half an ans")
      return { content: "Half an ans", error: "The concierge lost its connection. Please try again." }
    })
    renderChat()
    const dialog = await ask("ramen?")
    expect(await within(dialog).findByText("Half an ans")).toBeTruthy()
    expect((await within(dialog).findByRole("alert")).textContent).toContain("lost its connection")
  })

  it("stops a reply on request and says so", async () => {
    mockStreamTripChat.mockImplementation(
      (request: Request, _token: unknown, handlers: Handlers) =>
        new Promise((_resolve, reject) => {
          handlers.onText("Start of")
          request.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
        }),
    )
    renderChat()
    const dialog = await ask("ramen?")
    fireEvent.click(await within(dialog).findByRole("button", { name: "Stop the reply" }))
    expect(await within(dialog).findByText("Stopped.", { selector: "[data-concierge-reply] p" })).toBeTruthy()
    expect(within(dialog).getByText("Start of")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Send message" })).toBeTruthy()
  })

  it("remembers the conversation for the trip, and New chat clears it", async () => {
    const first = renderChat()
    const dialog = await ask("ramen?")
    await within(dialog).findByRole("list", { name: "Suggested places" })
    await waitFor(() => expect(localStorage.getItem("trips-concierge-v1:tokyo")).toContain("Ichiran"))
    first.unmount()

    renderChat()
    const again = await openChat()
    expect(within(again).getByText("ramen?")).toBeTruthy()
    expect(within(again).getByRole("list", { name: "Suggested places" })).toBeTruthy()

    fireEvent.click(within(again).getByRole("button", { name: "New chat" }))
    expect(within(again).queryByText("ramen?")).toBeNull()
    expect(within(again).getByRole("list", { name: "Suggested questions" })).toBeTruthy()
    expect(localStorage.getItem("trips-concierge-v1:tokyo")).toBeNull()
  })

  it("asks for a position only when the traveller turns it on, for one message", async () => {
    const getCurrentPosition = vi.fn((ok: (pos: { coords: { latitude: number; longitude: number } }) => void) =>
      ok({ coords: { latitude: 35.71, longitude: 139.79 } }),
    )
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } })
    renderChat()
    const dialog = await openChat()
    const toggle = within(dialog).getByRole("button", { name: "Share my location with the next message" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(toggle)
    expect(within(dialog).getByText(/goes with the next message only/)).toBeTruthy()
    const box = within(dialog).getByRole("textbox", { name: "Message the concierge" })
    fireEvent.change(box, { target: { value: "coffee near me" } })
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(mockStreamTripChat).toHaveBeenCalledTimes(1))
    expect((mockStreamTripChat.mock.calls[0]![0] as Request).location).toEqual({ lat: 35.71, lng: 139.79 })
    expect(await within(dialog).findByText("Sent with your location")).toBeTruthy()

    fireEvent.change(box, { target: { value: "and tea?" } })
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(mockStreamTripChat).toHaveBeenCalledTimes(2))
    expect((mockStreamTripChat.mock.calls[1]![0] as Request).location).toBeUndefined()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })
})
