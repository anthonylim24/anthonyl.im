import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FlipTime } from "../components/FlipTime"
import { runTripsViewTransition } from "../ui"

const { reduced } = vi.hoisted(() => ({ reduced: { current: false } }))

vi.mock("motion/react", () => ({
  useReducedMotion: () => reduced.current,
}))

describe("FlipTime", () => {
  it("renders the value as one string when motion is reduced", () => {
    reduced.current = true
    render(<FlipTime value="19:40" />)
    expect(screen.getByText("19:40")).toBeInTheDocument()
    expect(document.querySelector(".trips-flip-glyph")).toBeNull()
  })

  it("flaps changed glyphs when the clock ticks", () => {
    reduced.current = false
    const { rerender } = render(<FlipTime value="19:40" />)
    expect(screen.getByText("19:40")).toBeInTheDocument()
    expect(document.querySelectorAll(".trips-flip-glyph")).toHaveLength(0)

    rerender(<FlipTime value="19:41" />)
    expect(screen.getByText("19:41")).toBeInTheDocument()
    expect(document.querySelectorAll(".trips-flip-glyph").length).toBeGreaterThan(0)
  })

  it("plays the flap on mount when asked", () => {
    reduced.current = false
    render(<FlipTime value="08:00" playOnMount />)
    expect(document.querySelectorAll(".trips-flip-glyph").length).toBe(5)
  })
})

describe("runTripsViewTransition", () => {
  it("updates immediately when View Transitions are missing", () => {
    const update = vi.fn()
    runTripsViewTransition(update)
    expect(update).toHaveBeenCalledOnce()
  })
})
