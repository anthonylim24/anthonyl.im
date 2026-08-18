import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CompactChromeProvider, useCompactChrome } from "../useCompactChrome"

function Probe() {
  const compact = useCompactChrome()
  return (
    <div className="trips" data-testid="root">
      <header className="cover-band">Cover</header>
      <div data-testid="compact">{compact ? "yes" : "no"}</div>
    </div>
  )
}

describe("useCompactChrome", () => {
  it("starts expanded and writes cover progress without a measured cover height", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 })
    render(
      <CompactChromeProvider>
        <Probe />
      </CompactChromeProvider>,
    )
    expect(screen.getByTestId("compact")).toHaveTextContent("no")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-t")).toBe("0.0000")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-h")).toBe("")

    await act(async () => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 40 })
      window.dispatchEvent(new Event("scroll"))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })

    expect(screen.getByTestId("compact")).toHaveTextContent("no")
    expect(Number(screen.getByTestId("root").style.getPropertyValue("--trips-cover-t"))).toBeCloseTo(
      40 / 96,
      3,
    )
  })

  it("marks chrome compact after the cover fade finishes", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 })
    render(
      <CompactChromeProvider>
        <Probe />
      </CompactChromeProvider>,
    )

    await act(async () => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 90 })
      window.dispatchEvent(new Event("scroll"))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })

    expect(screen.getByTestId("compact")).toHaveTextContent("yes")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-t")).toBe("1.0000")
    expect(screen.getByTestId("root").style.getPropertyValue("--trips-cover-h")).toBe("")
  })
})
