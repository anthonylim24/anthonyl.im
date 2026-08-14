import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { SectionHeader } from "../components/SectionHeader"

describe("SectionHeader", () => {
  it("renders a plain title and optional subtitle without numerals or tracking labels", () => {
    const { container } = render(<SectionHeader title="Days" subtitle="Open a day for the full plan." />)
    expect(screen.getByRole("heading", { name: "Days" })).toBeInTheDocument()
    expect(screen.getByText("Open a day for the full plan.")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\d\b/)
    expect(container.innerHTML).not.toMatch(/uppercase tracking/)
  })

  it("omits subtitle markup when none is passed", () => {
    render(<SectionHeader title="Reservations" />)
    expect(screen.getByRole("heading", { name: "Reservations" })).toBeInTheDocument()
    expect(screen.queryByText(/booked moments/i)).not.toBeInTheDocument()
  })
})
