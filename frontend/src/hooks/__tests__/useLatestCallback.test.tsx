import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useLatestCallback } from "../useLatestCallback"

describe("useLatestCallback", () => {
  it("keeps a stable identity while calling the latest function", () => {
    const first = { n: 1 }
    const { result, rerender } = renderHook(
      ({ value }) => useLatestCallback(() => value.n),
      { initialProps: { value: first } },
    )
    const initial = result.current
    expect(initial()).toBe(1)

    rerender({ value: { n: 2 } })
    expect(result.current).toBe(initial)
    expect(result.current()).toBe(2)
  })
})
