import { describe, it, expect, vi, afterEach } from "vitest"
import { Effect } from "effect"
import { fetchExternal, readErrorMessage, requestJson } from "../http"
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

describe("fetchExternal", () => {
  it("calls native fetch with the absolute URL", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    const res = await runPromise(fetchExternal("https://example.test/photo", { method: "GET" }))
    expect(spy).toHaveBeenCalledWith("https://example.test/photo", { method: "GET" })
    expect(res.status).toBe(204)
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

  it("keeps caller-provided headers when adding the bearer token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    )
    await runPromise(
      requestJson(async () => "tok", "/api/trips", {
        headers: { Accept: "application/json", "X-Idempotency-Key": "abc" },
      }),
    )
    const init = spy.mock.calls[0]![1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get("Accept")).toBe("application/json")
    expect(headers.get("X-Idempotency-Key")).toBe("abc")
    expect(headers.get("Authorization")).toBe("Bearer tok")
  })
})
