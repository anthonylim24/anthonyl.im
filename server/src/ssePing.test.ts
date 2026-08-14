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

  test("swallows later ping write failures so work still resolves", async () => {
    let writes = 0
    let resolveWork!: (value: number) => void
    const work = new Promise<number>((resolve) => {
      resolveWork = resolve
    })
    const done = withSsePings(
      async () => {
        writes += 1
        if (writes > 1) throw new Error("closed")
      },
      work,
      20,
    )
    await Bun.sleep(5)
    expect(writes).toBe(1)
    await Bun.sleep(30)
    expect(writes).toBeGreaterThan(1)
    resolveWork(7)
    expect(await done).toBe(7)
  })
})
