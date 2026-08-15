import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { useTranscriptAnchor } from "../useTranscriptAnchor"

function Probe({ userId, layoutKey }: { userId?: string; layoutKey: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { anchorRef, spacerRef } = useTranscriptAnchor(scrollRef, userId, layoutKey)
  return (
    <div ref={scrollRef} data-testid="scroller">
      {userId ? (
        <div ref={anchorRef} data-testid="anchor">
          {userId}
        </div>
      ) : null}
      <div ref={spacerRef} data-testid="spacer" />
    </div>
  )
}

function Harness() {
  const [userId, setUserId] = useState<string | undefined>()
  const [layoutKey, setLayoutKey] = useState("idle")
  return (
    <div>
      <button type="button" onClick={() => setUserId("u1")}>
        send
      </button>
      <button type="button" onClick={() => setLayoutKey((k) => `${k}-token`)}>
        token
      </button>
      <button type="button" onClick={() => setUserId("u2")}>
        send-again
      </button>
      <Probe userId={userId} layoutKey={layoutKey} />
    </div>
  )
}

describe("useTranscriptAnchor", () => {
  it("scrolls only when the latest user turn changes", () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo

    try {
      render(<Harness />)
      scrollTo.mockClear()

      fireEvent.click(screen.getByRole("button", { name: "send" }))
      expect(screen.getByTestId("anchor")).toHaveTextContent("u1")
      const afterFirst = scrollTo.mock.calls.length
      expect(afterFirst).toBeGreaterThan(0)

      fireEvent.click(screen.getByRole("button", { name: "token" }))
      fireEvent.click(screen.getByRole("button", { name: "token" }))
      expect(scrollTo.mock.calls.length).toBe(afterFirst)

      fireEvent.click(screen.getByRole("button", { name: "send-again" }))
      expect(screen.getByTestId("anchor")).toHaveTextContent("u2")
      expect(scrollTo.mock.calls.length).toBeGreaterThan(afterFirst)
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })
})
