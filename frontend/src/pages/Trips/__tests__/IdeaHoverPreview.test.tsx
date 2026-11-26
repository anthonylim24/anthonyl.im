import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FOCUS_REST_MS, IdeaPreview } from "../ideas/IdeaPreview"
import { clearPlaceDetailsCache } from "../ideas/placeDetailsApi"
import { HOVER_CLOSE_MS, HOVER_INTENT_MS } from "../map/useIdeaHover"
import { AtlasMap } from "../map/AtlasMap"
import { ideaPins, type AtlasPin } from "../map/geo"
import type { Trip } from "../types"
import { makeItem, makeTrip, stubMatchMedia } from "./tripFixtures"

// The fallback chart, not the live map: happy-dom has no WebGL.

const SEOUL = { lat: 37.5665, lng: 126.978 }
const stops: AtlasPin[] = [
  { id: "s1", lat: 37.5665, lng: 126.978, title: "City Hall", label: "1", variant: "stop" },
  { id: "s2", lat: 37.58, lng: 127.01, title: "Hyehwa", label: "2", variant: "stop" },
]

const trip: Trip = makeTrip({
  destinations: ["Seoul"],
  days: [{ id: "d1", date: "2026-05-01", city: "Seoul", items: [makeItem({ id: "hall", title: "City Hall", location: { name: "City Hall", source: "user", ...SEOUL } })] }],
  ideas: [
    makeItem({
      id: "market",
      title: "Gwangjang Market",
      notes: "Try the bindaetteok at stall 17\nThen the mayak gimbap",
      location: { name: "Gwangjang Market", address: "88 Changgyeonggung-ro, Jongno District, Seoul, South Korea", lat: 37.57, lng: 126.9996, category: "market", source: "user" },
    }),
    makeItem({ id: "palace", title: "Changdeokgung", location: { name: "Changdeokgung", lat: 37.5794, lng: 126.991, category: "palace", source: "user" } }),
  ],
})

function renderMap() {
  return render(
    <AtlasMap
      pins={stops}
      frameKey="k"
      label="Map of day 1"
      ideaPins={ideaPins(trip)}
      ideaPreview={(id, via) => {
        const idea = trip.ideas!.find((i) => i.id === id)
        return idea ? <IdeaPreview idea={idea} trip={trip} via={via} /> : null
      }}
    />,
  )
}

const pin = (name: string) => screen.getByRole("button", { name: `${name}, on the wishlist` })
const photo = { url: "https://images.example/market.jpg", author: { name: "Min Ji" } }
const answer = (place: unknown) => new Response(JSON.stringify({ place }), { headers: { "content-type": "application/json" } })
const detailsCalls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/api/places/details"))
const settleLookup = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
})

describe("a wishlist pin's preview", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    stubMatchMedia(false)
    localStorage.clear()
    vi.useFakeTimers()
    clearPlaceDetailsCache()
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer(null))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("shows what the place is after a mouse rests on its pin, and goes a moment after it leaves", async () => {
    fetchSpy.mockImplementation(async () => answer({ name: "Gwangjang Market", photos: [photo] }))
    renderMap()
    expect(pin("Gwangjang Market")).toHaveAccessibleDescription("Food & cafés, Seoul. 88 Changgyeonggung-ro, Jongno District")
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    expect(screen.queryByRole("tooltip")).toBeNull()
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS - 1))
    expect(detailsCalls(fetchSpy)).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1))

    const card = screen.getByRole("tooltip")
    expect(card).toHaveTextContent("Gwangjang Market")
    expect(card).toHaveTextContent("Food & cafés · Seoul")
    expect(card).toHaveTextContent("88 Changgyeonggung-ro, Jongno District")
    expect(card).toHaveTextContent("Try the bindaetteok at stall 17")
    expect(card).not.toHaveTextContent("mayak")
    expect(card).not.toHaveTextContent(/for details/i)

    const frame = card.firstElementChild!
    expect(card.querySelector("img")).toBeNull()
    await settleLookup()
    expect(detailsCalls(fetchSpy)).toHaveLength(1)
    expect(card.firstElementChild).toBe(frame)
    expect(frame.querySelector("img")).toHaveAttribute("src", photo.url)
    expect(frame).toHaveTextContent("Photo: Min Ji")

    fireEvent.pointerLeave(pin("Gwangjang Market"), { pointerType: "mouse" })
    expect(screen.getByRole("tooltip")).toBe(card)
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS))
    expect(screen.queryByRole("tooltip")).toBeNull()

    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    expect(screen.getByRole("tooltip").querySelector("img")).toHaveAttribute("src", photo.url)
    await settleLookup()
    expect(detailsCalls(fetchSpy)).toHaveLength(1)
  })

  it("asks once for a place hovered twice before its answer comes, and gives the photo's room back when there is none", async () => {
    let reply: (res: Response) => void = () => {}
    fetchSpy.mockImplementation(async (url: unknown) =>
      String(url).includes("/api/places/details")
        ? new Promise<Response>((resolve) => (reply = resolve))
        : new Response(JSON.stringify({ query: { geosearch: [] } }), { headers: { "content-type": "application/json" } }),
    )
    renderMap()
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    await settleLookup()
    fireEvent.pointerDown(pin("Gwangjang Market"), { pointerType: "mouse" })
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    await settleLookup()
    expect(detailsCalls(fetchSpy)).toHaveLength(1)
    const card = screen.getByRole("tooltip")
    expect(card.children).toHaveLength(2)
    const room = card.firstElementChild!
    const open = room.className

    // The room eases shut (a class change) rather than unmounting.
    reply(answer(null))
    await settleLookup()
    expect(card.firstElementChild).toBe(room)
    expect(room.className).not.toBe(open)
    expect(room.querySelector("img")).toBeNull()
    expect(card).toHaveTextContent("Gwangjang Market")

    fireEvent.pointerDown(pin("Gwangjang Market"), { pointerType: "mouse" })
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    expect(screen.getByRole("tooltip").children).toHaveLength(1)
  })

  it("looks a place up only once keyboard focus has rested on its pin", async () => {
    renderMap()
    act(() => pin("Changdeokgung").focus())
    act(() => pin("Gwangjang Market").focus())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOCUS_REST_MS - 1)
    })
    expect(detailsCalls(fetchSpy)).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(detailsCalls(fetchSpy)).toEqual([expect.stringContaining("name=Gwangjang+Market")])
  })

  it("stays while the mouse crosses to the card and rests on it, or comes back to the pin", () => {
    renderMap()
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    const card = screen.getByRole("tooltip")

    fireEvent.pointerLeave(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS / 2))
    fireEvent.pointerEnter(card, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS * 3))
    expect(screen.getByRole("tooltip")).toBe(card)

    fireEvent.pointerLeave(card, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS / 2))
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS * 3))
    expect(screen.getByRole("tooltip")).toBe(card)

    // Straight from the pin onto the card, the card's enter can be heard before the pin's leave.
    fireEvent.pointerEnter(card, { pointerType: "mouse" })
    fireEvent.pointerLeave(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_MS * 3))
    expect(screen.getByRole("tooltip")).toBe(card)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("shows nothing for a tap, so a tap still just opens the place", () => {
    renderMap()
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "touch" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 2))
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("goes when the pin is pressed, and shows one place at a time", () => {
    renderMap()
    fireEvent.pointerEnter(pin("Gwangjang Market"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    fireEvent.pointerDown(pin("Gwangjang Market"), { pointerType: "mouse" })
    expect(screen.queryByRole("tooltip")).toBeNull()

    fireEvent.pointerEnter(pin("Changdeokgung"), { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    expect(screen.getAllByRole("tooltip")).toHaveLength(1)
    expect(screen.getByRole("tooltip")).toHaveTextContent("Sights & culture")
  })

  it("shows at once for keyboard focus, and goes on Escape and on blur", () => {
    renderMap()
    act(() => pin("Changdeokgung").focus())
    const card = screen.getByRole("tooltip")
    expect(card).toHaveTextContent("Changdeokgung")
    expect(card).toHaveTextContent("Sights & culture")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()

    act(() => pin("Gwangjang Market").focus())
    expect(screen.getByRole("tooltip")).toHaveTextContent("Gwangjang Market")
    act(() => pin("Gwangjang Market").blur())
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("goes with its pin when the wishlist is hidden from the map's key", () => {
    renderMap()
    act(() => pin("Gwangjang Market").focus())
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Wishlist places on the map/ }))
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
