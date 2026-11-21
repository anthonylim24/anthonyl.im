import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { printTrip } from "./printFixture"

// The printout's chunk can't be fetched (offline, or a build that is gone).
vi.mock("../PrintItinerary", () => ({
  get PrintItinerary(): never {
    throw new Error("Failed to fetch dynamically imported module: /assets/PrintItinerary-old.js")
  },
}))

import { usePrintItinerary } from "../usePrintItinerary"

describe("usePrintItinerary", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ends printing and reports it when the printout can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const onError = vi.fn()
    function Harness() {
      const { printing, print, node } = usePrintItinerary(printTrip(), onError)
      return (
        <>
          <button type="button" onClick={print} disabled={printing}>
            Print itinerary
          </button>
          {node}
        </>
      )
    }
    render(<Harness />)
    act(() => screen.getByRole("button", { name: "Print itinerary" }).click())
    expect(screen.getByRole("button", { name: "Print itinerary" })).toBeDisabled()

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(screen.getByRole("button", { name: "Print itinerary" })).toBeEnabled()
  })
})
