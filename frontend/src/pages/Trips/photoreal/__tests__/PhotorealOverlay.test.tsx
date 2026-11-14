import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { SceneOptions } from "../scene"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

const engine = () => ({
  dispose: vi.fn(),
  setStops: vi.fn(),
  select: vi.fn(),
  setInsets: vi.fn(),
  setTheme: vi.fn(),
  fitAll: vi.fn(),
  rest: vi.fn(),
  setHot: vi.fn(),
  setUser: vi.fn(),
  showUser: vi.fn(),
  orientNorth: vi.fn(),
  toggleTilt: vi.fn(() => true),
})
const created: Array<{ opts: SceneOptions; scene: ReturnType<typeof engine> }> = []
const mockCreate = vi.fn(async (opts: SceneOptions) => {
  const scene = engine()
  created.push({ opts, scene })
  return scene
})

vi.mock("../scene", () => ({ PhotorealScene: { create: (opts: SceneOptions) => mockCreate(opts) } }))
vi.mock("../photo", () => ({ useStopPhoto: () => ({ status: "none" }) }))

import PhotorealOverlay from "../PhotorealOverlay"

const trip = makeTrip()
const stop = (id: string, lat: number): ItineraryItem =>
  makeItem({ id, title: `Stop ${id}`, location: { name: `Stop ${id}`, lat, lng: -9.14 } as ItineraryItem["location"] })
const day = (items: ItineraryItem[]): TripDay => ({ id: "day-1", date: "2026-07-10", items })
const view = (items: ItineraryItem[]) => <PhotorealOverlay trip={trip} day={day(items)} dayNumber={1} onClose={() => {}} />

describe("PhotorealOverlay", () => {
  beforeEach(() => {
    // Wide layout, motion allowed (the tour is off under reduced motion).
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    created.length = 0
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("starts the engine when a day with no pinned stops gains one", async () => {
    const { rerender } = render(view([makeItem({ id: "n", kind: "note", title: "Pack" })]))
    expect(screen.getByText(/no pinned stops yet/)).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()

    rerender(view([stop("a", 38.71)]))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/no pinned stops yet/)).not.toBeInTheDocument()
    expect(screen.getByText(/Loading .* in 3D/)).toBeInTheDocument()
  })

  it("disposes the engine as soon as it fails", async () => {
    render(view([stop("a", 38.71), stop("b", 38.72)]))
    await waitFor(() => expect(created).toHaveLength(1))
    await act(async () => {})
    act(() => created[0]!.opts.onError("unavailable"))
    expect(created[0]!.scene.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: /isn’t available/ })).toBeInTheDocument()
  })

  it("disposes an engine that failed before it finished starting", async () => {
    let finish!: () => void
    const scene = engine()
    mockCreate.mockImplementationOnce(async (opts: SceneOptions) => {
      created.push({ opts, scene })
      await new Promise<void>((resolve) => (finish = resolve))
      return scene
    })
    render(view([stop("a", 38.71)]))
    await waitFor(() => expect(created).toHaveLength(1))
    act(() => created[0]!.opts.onError("WebGL context lost"))
    await act(async () => finish())
    expect(scene.dispose).toHaveBeenCalledTimes(1)
  })

  it("stops the tour when the stop it is on leaves the day", async () => {
    const items = [stop("a", 38.71), stop("b", 38.72), stop("c", 38.73)]
    const { rerender } = render(view(items))
    fireEvent.click(await screen.findByRole("button", { name: "Play tour" }))
    expect(screen.getByRole("button", { name: "Pause tour" })).toHaveAttribute("aria-pressed", "true")

    rerender(view(items.slice(1)))
    const play = await screen.findByRole("button", { name: "Play tour" })
    expect(play).toHaveAttribute("aria-pressed", "false")
    // The next tap plays, it does not pause a tour nobody can see.
    fireEvent.click(play)
    expect(screen.getByRole("button", { name: "Pause tour" })).toBeInTheDocument()
  })
})
