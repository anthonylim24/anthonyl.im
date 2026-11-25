import { describe, expect, it } from "vitest"
import { useState } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Menu, Modal } from "../components/kit"

function Page({ dropOpener = false, fallback = false }: { dropOpener?: boolean; fallback?: boolean }) {
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState(false)
  return (
    <>
      {!gone && (
        <button type="button" onClick={() => setOpen(true)}>
          Trip details
        </button>
      )}
      <Menu label="Trip actions" trigger="…" items={[{ label: "Edit details", onSelect: () => setOpen(true) }]} />
      <a href="#saved" id="saved">
        Where it went
      </a>
      <Modal
        open={open}
        returnFocus={fallback ? () => document.getElementById("saved") : undefined}
        onClose={() => {
          if (dropOpener) setGone(true)
          setOpen(false)
        }}
        title="Details"
      >
        <input aria-label="Name" />
      </Modal>
    </>
  )
}

describe("Modal", () => {
  it("puts focus back on the button that opened it", async () => {
    render(<Page />)
    const opener = screen.getByRole("button", { name: "Trip details" })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Details" })).toContainElement(document.activeElement as HTMLElement))

    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it("returns to the menu button when a menu item opened it", async () => {
    render(<Page />)
    const trigger = screen.getByRole("button", { name: "Trip actions" })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit details" }))
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("sends focus to the fallback when the opener is gone", async () => {
    render(<Page dropOpener fallback />)
    const opener = screen.getByRole("button", { name: "Trip details" })
    opener.focus()
    fireEvent.click(opener)
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.getByRole("link", { name: "Where it went" })).toHaveFocus())
  })

  it("leaves focus alone when the opener is gone", async () => {
    render(<Page dropOpener />)
    const opener = screen.getByRole("button", { name: "Trip details" })
    opener.focus()
    fireEvent.click(opener)
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(opener.isConnected).toBe(false)
    // Nothing throws, and nothing is focused that no longer exists.
    await waitFor(() => expect(document.activeElement === opener).toBe(false))
  })
})
