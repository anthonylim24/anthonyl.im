import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { BUN_IDLE_TIMEOUT_SEC } from "./httpIdleTimeout"
import { withSsePings } from "./ssePing"

describe("Bun SSE idle timeout", () => {
  // Pings are the production keep-alive. A 255s no-ping soak would prove
  // idleTimeout in isolation but is too slow for CI; the constant is pinned
  // in httpIdleTimeout.test.ts and wired through Bun.serve in this case.
  test("keeps the socket open through a pause longer than Bun's 10s default", async () => {
    const app = new Hono()
    app.get("/sse", (c) =>
      streamSSE(c, async (stream) => {
        await withSsePings(
          () => stream.writeSSE({ event: "ping", data: "" }),
          (async () => {
            await Bun.sleep(12_000)
            await stream.writeSSE({ data: JSON.stringify("still here") })
            await stream.writeSSE({ data: "[DONE]" })
          })(),
        )
      }),
    )

    const server = Bun.serve({
      port: 0,
      idleTimeout: BUN_IDLE_TIMEOUT_SEC,
      fetch: app.fetch,
    })
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/sse`)
      const text = await res.text()
      expect(text).toContain("still here")
      expect(text).toContain("data: [DONE]")
    } finally {
      server.stop(true)
    }
  }, 20_000)
})
