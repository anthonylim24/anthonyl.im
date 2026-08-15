import { describe, expect, it, vi } from "vitest"
import {
  applyTurnSpacer,
  lastMessageIdByRole,
  measureContentBelowAnchor,
  scrollAnchorToTop,
  scrollTopForAnchor,
  turnSpacerHeight,
} from "../transcriptAnchor"

describe("lastMessageIdByRole", () => {
  it("returns the latest matching id", () => {
    const messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant" },
    ]
    expect(lastMessageIdByRole(messages, "user")).toBe("u2")
    expect(lastMessageIdByRole(messages, "assistant")).toBe("a2")
  })

  it("returns undefined when the role is missing", () => {
    expect(lastMessageIdByRole([{ id: "a1", role: "assistant" }], "user")).toBeUndefined()
    expect(lastMessageIdByRole([], "user")).toBeUndefined()
  })
})

describe("scrollTopForAnchor", () => {
  it("aligns the anchor with the container top", () => {
    expect(scrollTopForAnchor(80, 200, 260)).toBe(140)
  })

  it("does not scroll above the start", () => {
    expect(scrollTopForAnchor(0, 200, 160)).toBe(0)
  })
})

describe("turnSpacerHeight", () => {
  it("fills the leftover viewport under the latest turn", () => {
    expect(turnSpacerHeight(400, 120)).toBe(280)
  })

  it("collapses when the turn already fills the viewport", () => {
    expect(turnSpacerHeight(400, 520)).toBe(0)
  })
})

describe("measureContentBelowAnchor", () => {
  it("excludes the spacer from content below the user turn", () => {
    const container = {
      scrollHeight: 500,
      scrollTop: 40,
      getBoundingClientRect: () => ({ top: 100, bottom: 500 }) as DOMRect,
    }
    const anchor = {
      getBoundingClientRect: () => ({ top: 180, bottom: 220 }) as DOMRect,
    }
    // anchorBottom = 40 + (220 - 100) = 160; below = 500 - 80 - 160
    expect(measureContentBelowAnchor(container, anchor, 80)).toBe(260)
  })
})

describe("DOM helpers", () => {
  it("writes the spacer height and pins the anchor", () => {
    const scrollTo = vi.fn()
    const container = {
      clientHeight: 400,
      scrollHeight: 180,
      scrollTop: 0,
      offsetHeight: 400,
      getBoundingClientRect: () => ({ top: 0, bottom: 400 }) as DOMRect,
      scrollTo,
    } as unknown as HTMLElement
    const anchor = {
      offsetHeight: 48,
      getBoundingClientRect: () => ({ top: 16, bottom: 64 }) as DOMRect,
    } as unknown as HTMLElement
    const spacer = { offsetHeight: 0, style: { height: "" } } as unknown as HTMLElement

    expect(applyTurnSpacer(container, anchor, spacer)).toBe(236)
    expect(spacer.style.height).toBe("236px")
    expect(scrollAnchorToTop(container, anchor)).toBe(16)
    expect(scrollTo).toHaveBeenCalledWith({ top: 16 })
  })
})
