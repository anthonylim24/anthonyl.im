import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CompactChromeProvider, useCompactChrome } from "../useCompactChrome"

function Probe() {
  const compact = useCompactChrome()
  return (
    <div className="trips" data-testid="root">
      <div data-testid="compact">{compact ? "yes" : "no"}</div>
    </div>
  )
}

describe("useCompactChrome", () => {
  it("starts expanded, then compactifies after scrolling past the threshold", async () => {
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
  })
})
