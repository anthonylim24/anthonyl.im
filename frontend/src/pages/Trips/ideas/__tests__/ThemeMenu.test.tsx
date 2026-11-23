import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Modal } from "../../components/kit"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { announce, prepareAnnouncer } from "../announce"
import { ThemeSelect, ThemeTag } from "../ThemeMenu"
import { pickOption } from "../../__tests__/pickOption"

afterEach(() => {
  vi.clearAllMocks()
  document.querySelector("[data-trips-announcer]")?.remove()
})

const tram = makeItem({ id: "tram", title: "Tram 28" })
const belem = makeItem({ id: "belem", title: "Pastéis de Belém", theme: "shopping", location: { name: "Pastéis de Belém", category: "cafe", source: "user" } })

// The details popover can be a kit Modal (a sheet on phones). A portalled
// menu closes the moment it opens inside one (the dialog's focus trap pulls
// focus back out of it), so the details get a native select instead.
describe("ThemeSelect", () => {
  it("files the idea under a category from inside a dialog, without closing it", () => {
    const onClose = vi.fn()
    const onEdit = vi.fn()
    render(
      <Modal open onClose={onClose} title="Tram 28">
        <ThemeSelect idea={tram} locked={false} onEdit={onEdit} />
      </Modal>,
    )
    const select = screen.getByRole("combobox", { name: "Category for Tram 28: Other (automatic)" })
    expect(select).toHaveTextContent("Automatic (Other)")
    pickOption(select, "Shopping")
    expect(onEdit).toHaveBeenCalledTimes(1)
    const [fn, mark] = onEdit.mock.calls[0]!
    expect(mark).toEqual({ label: "Filed “Tram 28” under Shopping" })
    expect(fn(makeTrip({ ideas: [tram] })).ideas[0].theme).toBe("shopping")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("offers Automatic with what it would infer, and goes back to it", () => {
    const onEdit = vi.fn()
    render(<ThemeSelect idea={belem} locked={false} onEdit={onEdit} />)
    const select = screen.getByRole("combobox", { name: "Category for Pastéis de Belém: Shopping" })
    expect(select).toHaveTextContent("Shopping")
    pickOption(select, "Automatic (Food & cafés)")
    const [fn, mark] = onEdit.mock.calls[0]!
    expect(mark).toEqual({ label: "Filed “Pastéis de Belém” automatically" })
    expect(fn(makeTrip({ ideas: [belem] })).ideas[0]).not.toHaveProperty("theme")
  })

  it("shows the category as text while the trip is locked", () => {
    render(<ThemeSelect idea={belem} locked onEdit={vi.fn()} />)
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.getByText("Shopping")).toBeInTheDocument()
  })

  it("is plain text for a viewer", () => {
    render(<ThemeTag idea={tram} />)
    expect(screen.getByText("Other")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("announce", () => {
  it("stays audible while a dialog is open", () => {
    prepareAnnouncer()
    render(
      <Modal open onClose={() => {}} title="Pick a day">
        <p>Days</p>
      </Modal>,
    )
    announce("Added Tram 28 to day 2")
    const region = document.querySelector("[data-trips-announcer]")!
    expect(region).toHaveTextContent("Added Tram 28 to day 2")
    // Radix hides the rest of the page from screen readers, except live regions.
    expect(region).not.toHaveAttribute("aria-hidden")
    expect(region.closest("[aria-hidden='true']")).toBeNull()
  })

  it("reads a repeat of the same words again", () => {
    announce("Removed Tram 28")
    const region = document.querySelector("[data-trips-announcer]")!
    const first = region.textContent
    announce("Removed Tram 28")
    expect(region.textContent).not.toBe(first)
    expect(region.textContent?.trim()).toBe("Removed Tram 28")
  })
})
