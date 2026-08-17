import { describe, it, expect, vi, afterEach } from "vitest"
import { ApiNotConfiguredError, retryJob, submitUrl } from "../ingestApi"

afterEach(() => {
  vi.restoreAllMocks()
})

const getToken = async () => "tok"

describe("ingestApi", () => {
  it("upgrades 503 not_configured to ApiNotConfiguredError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not_configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(submitUrl(getToken, "https://www.instagram.com/p/abc/")).rejects.toBeInstanceOf(
      ApiNotConfiguredError,
    )
  })

  it("prefers body.error over body.message on submit failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited", message: "Something went wrong" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(submitUrl(getToken, "https://www.instagram.com/p/abc/")).rejects.toMatchObject({
      message: "rate_limited",
    })
  })

  it("reads error-only on retry failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "already_running", message: "ignored" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(retryJob(getToken, 9)).rejects.toMatchObject({ message: "already_running" })
  })

  it("treats HTML 200 as ApiNotConfiguredError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    )
    await expect(submitUrl(getToken, "https://www.instagram.com/p/abc/")).rejects.toBeInstanceOf(
      ApiNotConfiguredError,
    )
  })
})
