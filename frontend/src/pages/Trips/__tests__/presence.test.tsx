import { afterEach, describe, expect, it, vi } from "vitest"
import { useEffect, useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Menu, Modal } from "../components/kit"
import { Presence, useLeaving } from "../components/presence"

// The exits themselves are CSS (index.css); a test DOM has no animation
// engine, so these tests give the closing states an animation by hand and
// end it with an `animationend` event, the way a browser would. (Longhands:
// happy-dom does not compute `animation-name` from the shorthand.)
function withExitAnimations() {
  const style = document.createElement("style")
  style.textContent = `
    .trips-dialog[data-state="closed"], .trips-pop[data-state="closed"] { animation-name: leave; animation-duration: 150ms; }
    @keyframes leave { to { opacity: 0; } }
  `
  document.head.append(style)
  return () => style.remove()
}

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  vi.useRealTimers()
})

const unmounted = vi.fn()

function ShareFor({ trip }: { trip: string }) {
  useEffect(() => () => unmounted(trip), [trip])
  return (
    <Modal open onClose={() => {}} title={`Share ${trip}`}>
      <p>Invite people to {trip}</p>
    </Modal>
  )
}

function Index() {
  const [shareId, setShareId] = useState<string | null>(null)
  return (
    <>
      <button type="button" onClick={() => setShareId("Lisbon")}>
        Share Lisbon
      </button>
      <button type="button" onClick={() => setShareId("Kyoto")}>
        Share Kyoto
      </button>
      <button type="button" onClick={() => setShareId(null)}>
        Done
      </button>
      <Presence when={shareId}>{(trip) => <ShareFor trip={trip} />}</Presence>
    </>
  )
}

const dialogNode = () => document.querySelector<HTMLElement>(".trips-dialog")
// The page behind an open dialog is hidden from assistive tech, so these
// presses stand in for the app setting and clearing what is shown.
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name, hidden: true }))

describe("Presence", () => {
  it("keeps a closing dialog on screen, inert and with what it showed, until its exit ends", () => {
    restore = withExitAnimations()
    unmounted.mockClear()
    render(<Index />)
    press("Share Lisbon")
    expect(screen.getByRole("dialog", { name: "Share Lisbon" })).toBeInTheDocument()

    press("Done")
    const leaving = dialogNode()
    expect(leaving).not.toBeNull()
    expect(leaving).toHaveAttribute("data-state", "closed")
    expect(leaving).toHaveAttribute("inert")
    expect(leaving).toHaveTextContent("Invite people to Lisbon")
    expect(unmounted).not.toHaveBeenCalled()

    act(() => {
      fireEvent.animationEnd(leaving!, { animationName: "leave" })
    })
    expect(dialogNode()).toBeNull()
    expect(unmounted).toHaveBeenCalledWith("Lisbon")
  })

  it("lets go at once when nothing animates", () => {
    unmounted.mockClear()
    render(<Index />)
    press("Share Lisbon")
    press("Done")
    expect(dialogNode()).toBeNull()
    expect(unmounted).toHaveBeenCalledWith("Lisbon")
  })

  it("opens the new value when it is set again mid-exit", () => {
    restore = withExitAnimations()
    render(<Index />)
    press("Share Lisbon")
    press("Done")
    press("Share Kyoto")
    expect(screen.getByRole("dialog", { name: "Share Kyoto" })).toBeInTheDocument()
  })

  it("gives up after a deadline when no dialog ever reports back", () => {
    vi.useFakeTimers()
    const gone = vi.fn()
    function Silent() {
      useEffect(() => gone, [])
      return null
    }
    const view = render(<Presence when={true}>{() => <Silent />}</Presence>)
    view.rerender(<Presence when={false}>{() => <Silent />}</Presence>)
    expect(gone).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(gone).toHaveBeenCalledTimes(1)
  })
})

function Popover({ open }: { open: boolean }) {
  const leave = useLeaving(open)
  return leave.present ? (
    <div role="dialog" aria-label="Calendar" className="trips-pop" {...leave.bind}>
      <button type="button">12</button>
    </div>
  ) : null
}

describe("useLeaving", () => {
  it("holds a closing element, hidden from assistive tech and inert, until its animation ends", () => {
    restore = withExitAnimations()
    const view = render(<Popover open />)
    const node = screen.getByRole("dialog", { name: "Calendar" })
    expect(node).toHaveAttribute("data-state", "open")

    view.rerender(<Popover open={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(node.isConnected).toBe(true)
    expect(node).toHaveAttribute("data-state", "closed")
    expect(node).toHaveAttribute("inert")

    // A child's animation ending is not the exit.
    act(() => {
      fireEvent.animationEnd(node.querySelector("button")!, { animationName: "leave" })
    })
    expect(node.isConnected).toBe(true)
    act(() => {
      fireEvent.animationEnd(node, { animationName: "leave" })
    })
    expect(node.isConnected).toBe(false)
  })

  it("comes back as it was when reopened mid-exit", () => {
    restore = withExitAnimations()
    const view = render(<Popover open />)
    const node = screen.getByRole("dialog", { name: "Calendar" })
    view.rerender(<Popover open={false} />)
    view.rerender(<Popover open />)
    expect(screen.getByRole("dialog", { name: "Calendar" })).toBe(node)
    expect(node).toHaveAttribute("data-state", "open")
    expect(node).not.toHaveAttribute("inert")
  })

  it("does not linger when nothing animates", async () => {
    const view = render(<Popover open />)
    const node = screen.getByRole("dialog", { name: "Calendar" })
    view.rerender(<Popover open={false} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(node.isConnected).toBe(false)
  })

  it("lets the kit menu leave without taking clicks", () => {
    restore = withExitAnimations()
    const onSelect = vi.fn()
    render(<Menu label="Trip actions" trigger="…" items={[{ label: "Duplicate trip", onSelect }]} />)
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }))
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate trip" }), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    const leaving = document.querySelector<HTMLElement>('.trips-pop[data-state="closed"]')
    expect(leaving).not.toBeNull()
    expect(leaving).toHaveAttribute("inert")
    expect(screen.getByRole("button", { name: "Trip actions" })).toHaveFocus()
  })
})
