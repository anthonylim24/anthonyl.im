import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AiSheet } from "../workspace/AiPanels"

const sheet = (open: boolean, prompt: string | undefined, onRun = vi.fn()) => (
  <AiSheet open={open} onClose={vi.fn()} scope="day" prompt={prompt} dayLabel="Day 1" hasItems onRun={onRun} />
)

describe("AiSheet briefed", () => {
  it("opens with the brief written in, still the traveller's to edit and send", () => {
    const onRun = vi.fn()
    render(sheet(true, "Rain likely 2–5 PM. Suggest indoor places.", onRun))
    const box = screen.getByRole("textbox", { name: "What should AI look for?" })
    expect(box).toHaveValue("Rain likely 2–5 PM. Suggest indoor places.")
    fireEvent.change(box, { target: { value: "Rain likely 2–5 PM. Suggest a museum." } })
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }))
    expect(onRun).toHaveBeenCalledWith({ type: "day", prompt: "Rain likely 2–5 PM. Suggest a museum." })
  })

  it("opens empty without one", () => {
    const { rerender } = render(sheet(true, "Rain likely 2–5 PM."))
    rerender(sheet(false, undefined))
    rerender(sheet(true, undefined))
    expect(screen.getByRole("textbox", { name: "What should AI look for?" })).toHaveValue("")
  })
})
