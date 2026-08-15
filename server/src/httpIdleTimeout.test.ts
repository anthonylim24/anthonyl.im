import { describe, expect, test } from "bun:test"
import { BUN_IDLE_TIMEOUT_SEC } from "./httpIdleTimeout"
import { SSE_PING_MS } from "./ssePing"

describe("SSE keep-alive budget", () => {
  test("Bun idle timeout is the documented maximum, not the 10s default", () => {
    expect(BUN_IDLE_TIMEOUT_SEC).toBe(255)
  })

  test("pings fire well inside Bun's default 10s idle window", () => {
    expect(SSE_PING_MS).toBe(4_000)
  })
})
