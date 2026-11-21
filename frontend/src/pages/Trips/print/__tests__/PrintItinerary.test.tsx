import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import type { StillRequest } from "../../map/engine"
import { printTrip } from "./printFixture"

// The real stills need WebGL and MapLibre. The engine stub records each
// request and hands back a picture only when a test says so.
const engine = vi.hoisted(() => ({
  requests: [] as StillRequest[],
  dark: null as boolean | null,
  deliver: (() => {}) as (key: string, url: string) => void,
  cancel: vi.fn(),
  canRender: true,
}))

vi.mock("../../map/engine", () => ({
  renderStills: (requests: readonly StillRequest[], dark: boolean, onStill: (key: string, url: string) => void) => {
    engine.requests = [...requests]
    engine.dark = dark
    engine.deliver = onStill
    return engine.cancel
  },
}))

vi.mock("../../map/AtlasMap", () => ({ canRenderMap: () => engine.canRender }))

import { AFTERPRINT_FALLBACK_MS, PrintItinerary, STALL_MS } from "../PrintItinerary"
import { usePrintItinerary } from "../usePrintItinerary"

const still = (key: string) => `data:image/webp;base64,${btoa(key)}`
const printRoot = () => document.querySelector<HTMLElement>(".trips-print-root")

/** Let the dynamic import, React commits and the settle step run. */
async function flush() {
  await act(async () => {
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(0)
  })
}

let print: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  engine.requests = []
  engine.dark = null
  engine.cancel = vi.fn()
  engine.canRender = true
  print = vi.fn()
  Object.defineProperty(window, "print", { configurable: true, writable: true, value: print })
  document.title = "Trips"
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("PrintItinerary", () => {
  it("lays out a cover, a section per day with numbered stops, To schedule and the bookings, hidden from assistive tech", async () => {
    render(<PrintItinerary trip={printTrip()} onDone={() => {}} />)
    const root = printRoot()!
    expect(root).toHaveAttribute("aria-hidden", "true")
    expect(root.hasAttribute("inert")).toBe(true)
    // Lives outside the app so the print stylesheet can hide everything else.
    expect(root.parentElement).toBe(document.body)

    const paper = within(root)
    expect(paper.getByRole("heading", { level: 1, hidden: true })).toHaveTextContent("Lisbon Long Weekend")
    expect(paper.getByText("7 stops · 2 bookings · 2 of 3 days planned")).toBeInTheDocument()
    expect(paper.getByText("Day 1 · Friday, July 10 · Lisbon")).toBeInTheDocument()
    expect(paper.getByText("Day 2 · Saturday, July 11 · Lisbon")).toBeInTheDocument()
    expect(paper.getByText("Day 3 · Sunday, July 12 · Lisbon")).toBeInTheDocument()
    expect(paper.getByText("27° / 19° Sunny · 4 stops · 6.6 km · 2 to schedule")).toBeInTheDocument()
    expect(paper.getByText("Nothing planned yet")).toBeInTheDocument()

    // Pin numbers match the day map: pinned planned stops only.
    const dinner = paper.getByText("Dinner at Ramiro").closest("li")!
    expect(within(dinner).getByText("2")).toBeInTheDocument()
    expect(within(dinner).getByText("7:30 PM")).toBeInTheDocument()
    expect(within(dinner).getByText("→ 610 m · 8 min walk")).toBeInTheDocument()
    expect(within(paper.getByText("Find a fado bar").closest("li")!).queryByText(/^\d+$/)).toBeNull()
    expect(paper.getByText("To schedule")).toBeInTheDocument()

    expect(paper.getByRole("heading", { name: "Bookings", hidden: true })).toBeInTheDocument()
    expect(paper.getAllByText("ABC123")).toHaveLength(2) // on the day, and in the bookings list
    expect(paper.getAllByText("SNT-77")).toHaveLength(2)

    // The print stylesheet exists only with the printout, and names the trip in the footer.
    expect(root.querySelector("style")?.textContent).toContain('content: "Lisbon Long Weekend"')
  })

  it("prints after every still has arrived, with the pictures in place", async () => {
    // A blocking dialog freezes the screen: the status notice must be gone by then.
    let statusDuringDialog: Element | null | undefined
    print.mockImplementation(() => {
      statusDuringDialog = document.querySelector("[role=status]")
    })
    render(<PrintItinerary trip={printTrip()} onDone={() => {}} />)
    await flush()
    expect(engine.dark).toBe(false)
    expect(engine.requests.map((request) => request.key)).toEqual(["trip", "day:day-1", "day:day-3"])
    expect(engine.requests.every((request) => request.color === "#2f7bf0")).toBe(true)
    expect(screen.getByRole("status")).toHaveTextContent("Preparing the printout")

    await act(async () => {
      engine.deliver("trip", still("trip"))
      engine.deliver("day:day-1", still("day:day-1"))
    })
    expect(print).not.toHaveBeenCalled()
    await act(async () => engine.deliver("day:day-3", still("day:day-3")))
    await flush()

    expect(print).toHaveBeenCalledTimes(1)
    expect(statusDuringDialog).toBeNull()
    const pictures = Array.from(printRoot()!.querySelectorAll("img")).map((img) => img.getAttribute("src"))
    expect(pictures).toEqual([still("trip"), still("day:day-1"), still("day:day-3")])
    // "Save as PDF" takes the document title as the file name.
    expect(document.title).toBe("Lisbon Long Weekend itinerary")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("prints anyway when a still never comes, with the chart in its place", async () => {
    render(<PrintItinerary trip={printTrip()} onDone={() => {}} />)
    await flush()
    await act(async () => engine.deliver("trip", still("trip")))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS - 1)
    })
    expect(print).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await flush()
    expect(print).toHaveBeenCalledTimes(1)
    expect(engine.cancel).toHaveBeenCalled()
    const root = printRoot()!
    expect(root.querySelectorAll("img")).toHaveLength(1)
    // Both day maps fall back to the SVG chart of their stops.
    expect(root.querySelectorAll("svg circle").length).toBeGreaterThan(0)
  })

  it("prints straight away without WebGL, never loading the map engine", async () => {
    engine.canRender = false
    render(<PrintItinerary trip={printTrip()} onDone={() => {}} />)
    await flush()
    expect(engine.requests).toEqual([])
    expect(print).toHaveBeenCalledTimes(1)
  })

  it("calls onDone once on afterprint, restores the title and removes its listeners", async () => {
    const onDone = vi.fn()
    render(<PrintItinerary trip={printTrip()} onDone={onDone} />)
    await flush()
    await act(async () => {
      for (const request of engine.requests) engine.deliver(request.key, still(request.key))
    })
    await flush()
    expect(print).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event("afterprint"))
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.title).toBe("Trips")

    act(() => {
      window.dispatchEvent(new Event("afterprint"))
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTERPRINT_FALLBACK_MS)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("finishes without afterprint once the person is back on the page, or after the fallback", async () => {
    engine.canRender = false
    const back = vi.fn()
    const { unmount } = render(<PrintItinerary trip={printTrip()} onDone={back} />)
    await flush()
    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })
    expect(back).toHaveBeenCalledTimes(1)
    unmount()

    const later = vi.fn()
    render(<PrintItinerary trip={printTrip()} onDone={later} />)
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTERPRINT_FALLBACK_MS - 1)
    })
    expect(later).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(later).toHaveBeenCalledTimes(1)
  })

  it("cancels cleanly: no dialog, the stills stop, the stylesheet goes", async () => {
    const onDone = vi.fn()
    const { unmount } = render(<PrintItinerary trip={printTrip()} onDone={onDone} />)
    await flush()
    act(() => screen.getByRole("button", { name: "Cancel" }).click())
    expect(onDone).toHaveBeenCalledTimes(1)

    unmount()
    expect(engine.cancel).toHaveBeenCalled()
    expect(printRoot()).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALL_MS * 4)
    })
    expect(print).not.toHaveBeenCalled()
  })

  it("prints the trip as it was asked for, even if it changes while the maps draw", async () => {
    const trip = printTrip()
    const { rerender } = render(<PrintItinerary trip={trip} onDone={() => {}} />)
    await flush()
    const first = engine.requests
    rerender(<PrintItinerary trip={{ ...trip, name: "Renamed" }} onDone={() => {}} />)
    await flush()
    expect(engine.requests).toBe(first)
    expect(within(printRoot()!).getByRole("heading", { level: 1, hidden: true })).toHaveTextContent("Lisbon Long Weekend")
  })
})

describe("usePrintItinerary", () => {
  function Harness() {
    const { printing, print: start, node } = usePrintItinerary(printTrip())
    return (
      <>
        <button type="button" onClick={start} disabled={printing}>
          Print itinerary
        </button>
        {node}
      </>
    )
  }

  it("mounts the printout on print() and removes it when the dialog is over", async () => {
    engine.canRender = false
    render(<Harness />)
    expect(printRoot()).toBeNull()

    act(() => screen.getByRole("button", { name: "Print itinerary" }).click())
    expect(screen.getByRole("button", { name: "Print itinerary" })).toBeDisabled()
    // The printout's chunk loads on demand.
    await flush()
    await flush()
    expect(printRoot()).not.toBeNull()
    expect(print).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event("afterprint"))
    })
    expect(printRoot()).toBeNull()
    expect(screen.getByRole("button", { name: "Print itinerary" })).toBeEnabled()
  })
})
