import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { OverlayBoundary } from "../OverlayBoundary"

function Boom(): never {
  throw new Error("Failed to fetch dynamically imported module: /assets/photoreal-old.js")
}

afterEach(() => vi.restoreAllMocks())

describe("OverlayBoundary", () => {
  it("takes down only the overlay and reports the error once", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const onError = vi.fn()
    render(
      <div>
        <p>Itinerary</p>
        <OverlayBoundary onError={onError}>
          <Boom />
        </OverlayBoundary>
      </div>,
    )
    expect(screen.getByText("Itinerary")).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as Error).message).toContain("dynamically imported")
  })

  it("renders its children when nothing is wrong", () => {
    render(
      <OverlayBoundary onError={() => {}}>
        <p>3D view</p>
      </OverlayBoundary>,
    )
    expect(screen.getByText("3D view")).toBeInTheDocument()
  })
})
