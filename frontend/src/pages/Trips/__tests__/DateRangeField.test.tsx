import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DateRangeField, formatRangeLabel } from "../components/DateRangeField"

describe("formatRangeLabel", () => {
  it("joins the range with a hyphen and the day count with a comma", () => {
    expect(formatRangeLabel("2026-03-03", "2026-03-11")).toBe("Mar 3 - Mar 11, 2026, 9 days")
  })

  it("returns empty when either date is missing", () => {
    expect(formatRangeLabel("", "2026-03-11")).toBe("")
    expect(formatRangeLabel("2026-03-03", "")).toBe("")
  })
})

describe("DateRangeField", () => {
  it("opens a dialog, moves with arrows, and restores focus on Escape", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateRangeField startDate="" endDate="" onChange={onChange} />)

    const trigger = screen.getByRole("button", { name: "Select trip dates" })
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
    expect(trigger).toHaveAttribute("aria-expanded", "false")

    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    const dialog = screen.getByRole("dialog", { name: "Choose trip dates" })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("Pick the first day")).toBeInTheDocument()

    const firstDay = dialog.querySelector<HTMLButtonElement>("button[data-iso]")
    expect(firstDay).toBeTruthy()
    firstDay!.focus()
    fireEvent.keyDown(document, { key: "ArrowRight" })
    const days = [...dialog.querySelectorAll<HTMLButtonElement>("button[data-iso]")]
    expect(document.activeElement).toBe(days[1])

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Choose trip dates" })).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(trigger)
  })

  it("picks a start day, then an end day, and calls onChange", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<DateRangeField startDate="" endDate="" onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Select trip dates" }))
    const start = screen.getByRole("dialog").querySelector<HTMLButtonElement>("button[data-iso]")!
    await user.click(start)
    expect(onChange).toHaveBeenCalledWith(start.dataset.iso, start.dataset.iso)

    rerender(
      <DateRangeField startDate={start.dataset.iso!} endDate={start.dataset.iso!} onChange={onChange} />,
    )
    expect(screen.getByText("Now pick the last day")).toBeInTheDocument()

    const days = [...screen.getByRole("dialog").querySelectorAll<HTMLButtonElement>("button[data-iso]")]
    const later = days.find((b) => (b.dataset.iso ?? "") > start.dataset.iso!)!
    await user.click(later)
    expect(onChange).toHaveBeenLastCalledWith(start.dataset.iso, later.dataset.iso)
  })

  it("wires invalid and describedBy onto the trigger", () => {
    render(
      <>
        <p id="dates-error">Pick the first and last day.</p>
        <DateRangeField startDate="" endDate="" onChange={() => {}} invalid describedBy="dates-error" />
      </>,
    )
    const trigger = screen.getByRole("button", { name: "Select trip dates" })
    expect(trigger).toHaveAttribute("aria-invalid", "true")
    expect(trigger).toHaveAttribute("aria-describedby", "dates-error")
  })
})
