import { describe, expect, it } from "vitest"
import { LIM_ERRORS, errorIfIncomplete, isLostConnection, limHttpError, remapChatFailure } from "../chatErrors"

describe("remapChatFailure", () => {
  it("preserves AbortError", () => {
    const abort = new DOMException("aborted", "AbortError")
    expect(remapChatFailure(abort)).toBe(abort)
  })

  it("maps dropped fetches to a retryable concierge message", () => {
    expect(remapChatFailure(new TypeError("Failed to fetch")).message).toMatch(/lost its connection/i)
    expect(remapChatFailure(new TypeError("NetworkError when attempting to fetch resource.")).message).toMatch(
      /lost its connection/i,
    )
    expect(isLostConnection(new TypeError("load failed"))).toBe(true)
  })

  it("passes other Errors through", () => {
    const err = new Error("GEMINI_API_KEY is not set on the server.")
    expect(remapChatFailure(err)).toBe(err)
  })
})

describe("limHttpError", () => {
  it("speaks for each status family, never in codes", () => {
    expect(limHttpError(400)).toBe(LIM_ERRORS.tooLong)
    expect(limHttpError(413)).toBe(LIM_ERRORS.tooLong)
    expect(limHttpError(429)).toBe(LIM_ERRORS.busy)
    expect(limHttpError(502)).toBe(LIM_ERRORS.server)
    expect(limHttpError(418)).toBe(LIM_ERRORS.unknown)
    for (const status of [400, 429, 500]) expect(limHttpError(status)).not.toMatch(/\d{3}/)
  })
})

describe("errorIfIncomplete", () => {
  it("keeps an in-stream error even when [DONE] never arrived", () => {
    expect(errorIfIncomplete(false, "That took too long. Try again.")).toBe(
      "That took too long. Try again.",
    )
  })

  it("flags a silent close without [DONE]", () => {
    expect(errorIfIncomplete(false)).toMatch(/lost its connection/i)
  })

  it("stays quiet on a completed stream", () => {
    expect(errorIfIncomplete(true)).toBeUndefined()
  })
})
