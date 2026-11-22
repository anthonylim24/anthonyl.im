import { describe, expect, it, vi } from "vitest"
import { useEffect } from "react"
import { act, render } from "@testing-library/react"
import { liveValue, useHolds, useLiveValue, type LiveValue } from "../workspace/liveValue"

describe("liveValue", () => {
  it("tells its readers when the value changes, and not when it is set to the same", () => {
    const hot = liveValue<string | null>(null)
    const onChange = vi.fn()
    const stop = hot.subscribe(onChange)
    hot.set("a")
    hot.set("a")
    expect(hot.get()).toBe("a")
    expect(onChange).toHaveBeenCalledTimes(1)
    stop()
    hot.set("b")
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("re-renders only the cards whose answer changed", () => {
    const hot = liveValue<string | null>(null)
    const renders: Record<string, number> = {}
    function Card({ id, source }: { id: string; source: LiveValue<string | null> }) {
      const on = useHolds(source, id)
      renders[id] = (renders[id] ?? 0) + 1
      return <span data-testid={id}>{on ? "hot" : "cold"}</span>
    }
    const view = render(
      <>
        {["a", "b", "c"].map((id) => (
          <Card key={id} id={id} source={hot} />
        ))}
      </>,
    )
    act(() => hot.set("a"))
    act(() => hot.set("b"))
    expect(view.getByTestId("a")).toHaveTextContent("cold")
    expect(view.getByTestId("b")).toHaveTextContent("hot")
    expect(renders).toEqual({ a: 3, b: 2, c: 1 })
  })

  it("gives a reader the value itself", () => {
    const fly = liveValue(false)
    function Overlay() {
      return useLiveValue(fly) ? <p>open</p> : null
    }
    const view = render(<Overlay />)
    expect(view.queryByText("open")).toBeNull()
    act(() => fly.set(true))
    expect(view.getByText("open")).toBeInTheDocument()
  })

  it("reads a replacement source at once, and follows it", () => {
    function Overlay({ source }: { source: LiveValue<boolean> }) {
      return useLiveValue(source) ? <p>open</p> : null
    }
    const first = liveValue(true)
    const view = render(<Overlay source={first} />)
    expect(view.getByText("open")).toBeInTheDocument()
    const next = liveValue(false)
    view.rerender(<Overlay source={next} />)
    expect(view.queryByText("open")).toBeNull()
    act(() => first.set(false))
    act(() => next.set(true))
    expect(view.getByText("open")).toBeInTheDocument()
  })

  it("catches a write made before it subscribed", () => {
    const hot = liveValue<string | null>(null)
    function Card() {
      const on = useHolds(hot, "a")
      // A sibling's render runs before this card's effect subscribes.
      return <span data-testid="a">{on ? "hot" : "cold"}</span>
    }
    function Writer() {
      useEffect(() => hot.set("a"), [])
      return null
    }
    const view = render(
      <>
        <Writer />
        <Card />
      </>,
    )
    expect(view.getByTestId("a")).toHaveTextContent("hot")
  })
})
