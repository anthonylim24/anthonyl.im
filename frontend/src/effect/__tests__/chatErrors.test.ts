import { describe, expect, it } from "vitest"
import { isLostConnection, remapChatFailure } from "../chatErrors"

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
