import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { AiChip, ReservationChip, StatusChip, SuggestionChip, TripStatusChip } from "../components/StatusChip"
import { itemStatusMeta } from "../theme"

describe("StatusChip", () => {
  it("renders nothing for none", () => {
    const { container } = render(<StatusChip status="none" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("uses itemStatusMeta label and tint, without a status dot", () => {
    const { container } = render(<StatusChip status="booked" />)
    const chip = screen.getByText("Booked")
    expect(chip.className).toContain(itemStatusMeta.booked!.chip)
    expect(chip.className).toContain("rounded-[var(--tr-r-control)]")
    expect(container.querySelector(".rounded-full")).toBeNull()
  })

  it("keeps reservation status meaning", () => {
    render(
      <>
        <ReservationChip status="confirmed" />
        <ReservationChip status="pending" />
        <ReservationChip status="tentative" />
      </>,
    )
    expect(screen.getByText("Confirmed")).toBeInTheDocument()
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.getByText("Tentative")).toBeInTheDocument()
  })

  it("renders trip, suggestion, and AI chips without decorative dots", () => {
    const { container } = render(
      <>
        <TripStatusChip status="active" />
        <SuggestionChip kind="add" />
        <AiChip />
      </>,
    )
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Add")).toBeInTheDocument()
    expect(screen.getByText("AI")).toBeInTheDocument()
    expect(container.querySelector(".rounded-full")).toBeNull()
  })
})
