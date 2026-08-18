import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CompactChromeProvider, useCompactChrome } from "../useCompactChrome"

function Probe() {
  const compact = useCompactChrome()
  return (
    <div className="trips" data-testid="root">
      <header className="cover-band" style={{ height: 80 }}>
        Cover
      </header>
      <div data-testid="compact">{compact ? "yes" : "no"}</div>
    </div>
  )
}

describe("useCompactChrome", () => {
  it("starts expanded, then compactifies after scrolling past the threshold", async () => {
    const rect = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 80,
      right: 100,
      width: 100,
      height: 80,
      toJSON() {
        return this
      },
    }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("cover-band")) return rect
      return { ...rect, height: 0, bottom: 0 }
    })
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 })
    render(
      <CompactChromeProvider>
        <Probe />
      </CompactChromeProvider>,
    )
    expect(screen.getByTestId("compact")).toHaveTextContent("no")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-t")).toBe("0.0000")

    await act(async () => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 80 })
      window.dispatchEvent(new Event("scroll"))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })

    expect(screen.getByTestId("compact")).toHaveTextContent("yes")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-t")).toBe("0.8333")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-h")).toBe("80px")
  })
})
