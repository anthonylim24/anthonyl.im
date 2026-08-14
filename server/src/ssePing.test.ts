import { describe, expect, test } from "bun:test"
import { withSsePings } from "./ssePing"

describe("withSsePings", () => {
  test("writes a ping before the work resolves", async () => {
    const pings: number[] = []
    const result = await withSsePings(
      async () => {
        pings.push(Date.now())
      },
      Promise.resolve("ok"),
    )
    expect(result).toBe("ok")
    expect(pings.length).toBe(1)
  })

  test("still resolves when the ping writer throws after the first write", async () => {
    let writes = 0
    const result = await withSsePings(
      async () => {
        writes += 1
        if (writes > 1) throw new Error("closed")
      },
      Promise.resolve(7),
    )
    expect(result).toBe(7)
    expect(writes).toBe(1)
  })
})
