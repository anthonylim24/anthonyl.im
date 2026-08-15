import { describe, expect, it } from "vitest"
import { errorIfIncomplete, formatConciergeError, isLostConnection, remapChatFailure } from "../chatErrors"

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

describe("formatConciergeError", () => {
  it("keeps partial tokens and appends the warning", () => {
    expect(formatConciergeError("Hello, wo", "The concierge lost its connection. Please try again.")).toBe(
      "Hello, wo\n\n⚠️ The concierge lost its connection. Please try again.",
    )
  })

  it("shows only the warning when nothing streamed", () => {
    expect(formatConciergeError("  ", "boom")).toBe("⚠️ boom")
  })
})

describe("errorIfIncomplete", () => {
  it("keeps an in-stream error even when [DONE] never arrived", () => {
    expect(errorIfIncomplete(false, "That took too long. Please try again.")).toBe(
      "That took too long. Please try again.",
    )
  })

  it("flags a silent close without [DONE]", () => {
    expect(errorIfIncomplete(false)).toMatch(/lost its connection/i)
  })

  it("stays quiet on a completed stream", () => {
    expect(errorIfIncomplete(true)).toBeUndefined()
  })
})
