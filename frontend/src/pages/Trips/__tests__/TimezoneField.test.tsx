import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TimezoneField, cityLabel, offsetLabel } from "../components/TimezoneField"

describe("TimezoneField", () => {
  it("exposes combobox wiring and lists zones on focus", async () => {
    const user = userEvent.setup()
    render(<TimezoneField value="Asia/Tokyo" onChange={() => {}} />)

    const input = screen.getByRole("combobox", { name: "Time zone" })
    expect(input).toHaveAttribute("aria-expanded", "false")
    expect(input).toHaveAttribute("aria-autocomplete", "list")
    expect(input).toHaveValue(`${cityLabel("Asia/Tokyo")} (${offsetLabel("Asia/Tokyo")})`)

    await user.click(input)
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("listbox", { name: "Time zones" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Tokyo/ })).toBeInTheDocument()
  })

  it("moves the active option with arrows and selects on Enter", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimezoneField value="Asia/Tokyo" onChange={onChange} />)

    const input = screen.getByRole("combobox", { name: "Time zone" })
    await user.click(input)
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onChange).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })
  })

  it("filters by city name and reports no matches", async () => {
    const user = userEvent.setup()
    render(<TimezoneField value="UTC" onChange={() => {}} />)

    const input = screen.getByRole("combobox", { name: "Time zone" })
    await user.click(input)
    await user.keyboard("Seoul")
    expect(screen.getByRole("option", { name: /Seoul/ })).toBeInTheDocument()

    await user.clear(input)
    await user.keyboard("zzzz-not-a-zone")
    expect(screen.getByText("No matching time zone.")).toBeInTheDocument()
  })

  it("closes on Escape and wires invalid plus describedBy", async () => {
    const user = userEvent.setup()
    render(
      <>
        <p id="tz-error">Pick a time zone.</p>
        <TimezoneField value="UTC" onChange={() => {}} invalid describedBy="tz-error" />
      </>,
    )
    const input = screen.getByRole("combobox", { name: "Time zone" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", "tz-error")

    await user.click(input)
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })
  })
})
