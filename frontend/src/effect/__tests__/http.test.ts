import { describe, it, expect, vi, afterEach } from "vitest"
import { Effect } from "effect"
import { readErrorMessage, requestJson } from "../http"
import { runPromise } from "../runtime"

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("readErrorMessage", () => {
  it("prefers message, then error (trips contract)", async () => {
    const res = jsonResponse({ message: "friendly", error: "code" })
    await expect(Effect.runPromise(readErrorMessage(res, "message-first"))).resolves.toBe("friendly")
  })

  it("prefers error, then message (ingest throwOnError)", async () => {
    const res = jsonResponse({ message: "Something went wrong", error: "rate_limited" })
    await expect(Effect.runPromise(readErrorMessage(res, "error-first"))).resolves.toBe("rate_limited")
  })

  it("reads error only (places / retry)", async () => {
    const res = jsonResponse({ message: "ignored", error: "quota" })
    await expect(Effect.runPromise(readErrorMessage(res, "error-only"))).resolves.toBe("quota")
  })

  it("reads message only (korea chat)", async () => {
    const res = jsonResponse({ message: "GEMINI_API_KEY is not set on the server.", error: "missing_key" })
    await expect(Effect.runPromise(readErrorMessage(res, "message-only"))).resolves.toBe(
      "GEMINI_API_KEY is not set on the server.",
    )
  })

  it("falls back to HTTP status when the body is empty", async () => {
    const res = jsonResponse({}, 502)
    await expect(Effect.runPromise(readErrorMessage(res, "error-only"))).resolves.toBe("HTTP 502")
  })
})

describe("requestJson", () => {
  it("throws a message-first Error on non-OK JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ message: "Please sign in again.", error: "unauthorized" }, 401),
    )
    await expect(runPromise(requestJson(async () => "tok", "/api/trips"))).rejects.toMatchObject({
      message: "Please sign in again.",
    })
  })
})
