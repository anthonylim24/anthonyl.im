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

function PanelHarness() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const { anchorRef, spacerRef } = useTranscriptAnchor(scrollRef, "u1", `${open}:${streaming}`)
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        toggle
      </button>
      <button type="button" onClick={() => setStreaming((value) => !value)}>
        stream
      </button>
      {open ? (
        <div ref={scrollRef} data-testid="scroller">
          <div ref={anchorRef} data-testid="anchor">
            u1
          </div>
          <div ref={spacerRef} data-testid="spacer" />
        </div>
      ) : null}
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

  it("re-pins when the scroller remounts for the same user turn", () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo

    try {
      render(<PanelHarness />)
      fireEvent.click(screen.getByRole("button", { name: "toggle" }))
      expect(screen.getByTestId("anchor")).toHaveTextContent("u1")
      const afterOpen = scrollTo.mock.calls.length
      expect(afterOpen).toBeGreaterThan(0)

      fireEvent.click(screen.getByRole("button", { name: "stream" }))
      expect(scrollTo.mock.calls.length).toBe(afterOpen)

      fireEvent.click(screen.getByRole("button", { name: "toggle" }))
      expect(screen.queryByTestId("scroller")).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "toggle" }))
      expect(screen.getByTestId("anchor")).toHaveTextContent("u1")
      expect(scrollTo.mock.calls.length).toBeGreaterThan(afterOpen)
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })
})
