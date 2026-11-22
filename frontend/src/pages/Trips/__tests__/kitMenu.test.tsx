import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Menu } from "../components/kit"

function renderMenu() {
  const onSelect = vi.fn()
  render(
    <>
      <Menu label="Trip actions" trigger="…" items={[{ label: "Duplicate trip", onSelect }, { label: "Delete trip", onSelect }]} />
      <button type="button">Next on the page</button>
    </>,
  )
  return { onSelect }
}

describe("Menu", () => {
  it("closes when focus moves out of it", () => {
    renderMenu()
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }))
    const first = screen.getByRole("menuitem", { name: "Duplicate trip" })
    expect(first).toHaveFocus()

    // Moving between its own items keeps it open.
    fireEvent.blur(first, { relatedTarget: screen.getByRole("menuitem", { name: "Delete trip" }) })
    expect(screen.getByRole("menu")).toBeInTheDocument()

    // Tab past the end lands on the page: the menu goes.
    fireEvent.blur(first, { relatedTarget: screen.getByRole("button", { name: "Next on the page" }) })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(screen.getByRole("button", { name: "Trip actions" })).toHaveAttribute("aria-expanded", "false")
  })

  it("floats on <body> in the Trips token scope, so no pane can clip it", () => {
    render(
      <div style={{ overflow: "hidden" }} data-testid="pane">
        <Menu label="Trip actions" trigger="…" items={[{ label: "Duplicate trip", onSelect: () => {} }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }))
    const menu = screen.getByRole("menu")
    expect(screen.getByTestId("pane")).not.toContainElement(menu)
    expect(menu.parentElement).toHaveClass("trips", "trips-portal")
    expect(menu.style.position).toBe("fixed")
  })

  it("closes on Tab from its button, so focus moves on in page order", () => {
    renderMenu()
    const button = screen.getByRole("button", { name: "Trip actions" })
    fireEvent.click(button)
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate trip" }), { key: "Tab" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(button).toHaveFocus()
  })

  it("stays open through a blur with no target, so a pressed item still runs", () => {
    const { onSelect } = renderMenu()
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }))
    const item = screen.getByRole("menuitem", { name: "Delete trip" })
    fireEvent.blur(screen.getByRole("menuitem", { name: "Duplicate trip" }), { relatedTarget: null })
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
