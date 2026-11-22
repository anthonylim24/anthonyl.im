import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { IdeaDayPicker } from "../IdeaDayPicker"
import type { DaySuggestions } from "../contract"

// Trip days: 2026-07-10 (day-1), 2026-07-11 (day-2), 2026-07-12 (day-3, full).
const fullDay = Array.from({ length: 200 }, (_, i) => makeItem({ id: `f${i}`, title: `Stop ${i}` }))
const trip = makeTrip({
  endDate: "2026-07-12",
  days: [
    { id: "day-1", date: "2026-07-10", city: "Lisbon", items: [makeItem({ id: "a", title: "Belém Tower" })] },
    { id: "day-2", date: "2026-07-11", city: "Lisbon", items: [] },
    { id: "day-3", date: "2026-07-12", city: "Sintra", items: fullDay },
  ],
})
const idea = makeItem({
  id: "idea-1",
  title: "Time Out Market",
  notes: "Lunch",
  theme: "food",
  location: { name: "Time Out Market", address: "Av. 24 de Julho", lat: 38.707, lng: -9.146, category: "market", source: "user" },
})
const getToken = async () => "t"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function renderPicker() {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const view = render(<IdeaDayPicker trip={trip} idea={idea} getToken={getToken} onPick={onPick} onClose={onClose} />)
  return { onPick, onClose, ...view }
}

const recommended = () => screen.getByRole("region", { name: "Recommended" })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("IdeaDayPicker", () => {
  it("shows every day at once, then up to three recommended days with their reasons", async () => {
    let answer!: (res: Response) => void
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    renderPicker()

    // The full list is usable while recommendations load; the full day is off.
    expect(screen.getByRole("button", { name: /Day 1 · .*Lisbon · 1 stop/ })).toBeEnabled()
    expect(screen.getByRole("button", { name: /Day 3 · .*Full/ })).toBeDisabled()
    expect(recommended()).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent("")

    await act(async () => {})
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/trips/lisbon/ideas/suggest-days")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({
      idea: {
        title: "Time Out Market",
        notes: "Lunch",
        theme: "food",
        location: { name: "Time Out Market", address: "Av. 24 de Julho", lat: 38.707, lng: -9.146, category: "market" },
      },
    })

    const suggestions: DaySuggestions = {
      source: "nearby",
      picks: [
        { dayId: "day-2", reason: "Nothing planned yet in Lisbon" },
        { dayId: "day-1", reason: "1.2 km from Belém Tower", nearestKm: 1.234 },
        // Full on this device, and a day that no longer exists: neither is offered.
        { dayId: "day-3", reason: "Sintra day" },
        { dayId: "day-9", reason: "Gone" },
      ],
    }
    await act(async () => answer(json(suggestions)))

    const block = recommended()
    expect(block).toHaveAttribute("aria-busy", "false")
    const rows = within(block).getAllByRole("button")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(/Day 2 · .*Nothing planned yet in Lisbon/)
    expect(rows[1]).toHaveTextContent(/Day 1 · .*1\.2 km from Belém Tower.*1\.2 km/)
    expect(screen.getByRole("status")).toHaveTextContent("2 recommended days for Time Out Market")
    // The distance fallback carries no AI marker.
    expect(screen.queryByText("Suggested by AI")).not.toBeInTheDocument()
  })

  it("marks the model's picks as suggested by AI", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ source: "ai", picks: [{ dayId: "day-2", reason: "A free day for a long lunch" }] }))
    renderPicker()
    expect(await screen.findByText("A free day for a long lunch")).toBeInTheDocument()
    expect(within(recommended()).getByText("Suggested by AI")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("1 recommended day for Time Out Market")
  })

  it("on a failure, says so in one quiet line and leaves the full list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "unauthorized" }, 401))
    renderPicker()
    expect(await screen.findByText("Couldn’t suggest days just now. Any day below works.")).toBeInTheDocument()
    expect(within(recommended()).queryAllByRole("button")).toHaveLength(0)
    expect(screen.getByRole("button", { name: /Day 2 · / })).toBeEnabled()
    expect(screen.getByRole("status")).toHaveTextContent("")
  })

  it("hides the block when there is no day to recommend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ source: "nearby", picks: [] }))
    renderPicker()
    await act(async () => {})
    expect(screen.queryByRole("region", { name: "Recommended" })).not.toBeInTheDocument()
    expect(screen.queryByText("All days")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Day 1 · / })).toBeEnabled()
  })

  it("picking a recommended day picks it, then closes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ source: "ai", picks: [{ dayId: "day-2", reason: "A free day" }] }))
    const { onPick, onClose } = renderPicker()
    fireEvent.click(await within(recommended()).findByRole("button", { name: /A free day/ }))
    expect(onPick).toHaveBeenCalledWith("day-2")
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPick.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]!)
  })

  it("picking from the full list works before any answer", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}))
    const { onPick, onClose } = renderPicker()
    fireEvent.click(screen.getByRole("button", { name: /Day 1 · / }))
    expect(onPick).toHaveBeenCalledWith("day-1")
    expect(onClose).toHaveBeenCalled()
  })

  it("stops asking when the sheet closes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}))
    const { unmount } = renderPicker()
    await act(async () => {})
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.signal?.aborted).toBe(false)
    unmount()
    expect(init.signal?.aborted).toBe(true)
  })

  it("asks once, however often the trip changes while open", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ source: "nearby", picks: [] }))
    const { rerender } = renderPicker()
    await act(async () => {})
    rerender(<IdeaDayPicker trip={{ ...trip, updatedAt: "2026-02-01T00:00:00Z" }} idea={{ ...idea }} getToken={getToken} onPick={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
