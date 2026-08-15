import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { HttpStatusError, TimeoutError } from "../errors"
import { runPromise } from "../runtime"

describe("runPromise", () => {
  it("unwraps tagged failures as Error instances with the original message", async () => {
    await expect(
      runPromise(Effect.fail(new HttpStatusError({ status: 502, message: "HTTP 502" }))),
    ).rejects.toMatchObject({ message: "HTTP 502" })

    try {
      await runPromise(Effect.fail(new TimeoutError({ message: "Response timed out — please try again." })))
      throw new Error("expected reject")
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain("timed out")
    }
  })

  it("returns the success value", async () => {
    await expect(runPromise(Effect.succeed(42))).resolves.toBe(42)
  })
})
