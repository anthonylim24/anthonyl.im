import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const mockSearch = vi.fn(async () => [])
vi.mock("../geocode", () => ({ searchPlaces: (...args: unknown[]) => mockSearch(...(args as [])) }))

import { AddStop } from "../workspace/AddStop"

const LINK = "https://www.instagram.com/reel/abc/?igsh=1"

describe("AddStop with Instagram import", () => {
  afterEach(() => vi.clearAllMocks())

  it("offers to read a typed post link instead of searching for it", () => {
    const onInstagram = vi.fn()
    const onAdd = vi.fn()
    render(<AddStop near={null} onAdd={onAdd} onInstagram={onInstagram} />)
    const input = screen.getByRole("combobox")
    expect(input).toHaveAttribute("placeholder", expect.stringContaining("Instagram link"))
    fireEvent.change(input, { target: { value: LINK } })
    expect(screen.getAllByRole("option")).toHaveLength(1)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onInstagram).toHaveBeenCalledWith([LINK])
    expect(onAdd).not.toHaveBeenCalled()
    expect(input).toHaveValue("")
  })

  it("hands a pasted link straight to the import", () => {
    const onInstagram = vi.fn()
    render(<AddStop near={null} onAdd={vi.fn()} onInstagram={onInstagram} />)
    fireEvent.paste(screen.getByRole("combobox"), { clipboardData: { getData: () => `saw this ${LINK}` } })
    expect(onInstagram).toHaveBeenCalledWith([LINK])
  })

  it("treats a link as ordinary text when import is unavailable", () => {
    render(<AddStop near={null} onAdd={vi.fn()} />)
    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: LINK } })
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1)
    expect(input).toHaveAttribute("placeholder", "Add a place, note or booking…")
  })
})
