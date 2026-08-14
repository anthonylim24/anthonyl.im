import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Timeline, TimelineItem } from "../components/Timeline"

describe("Timeline", () => {
  it("places timed and untimed items on one rail", () => {
    render(
      <Timeline label="Day timeline">
        <TimelineItem time="10:00" endTime="11:30">
          <p>Lunch</p>
        </TimelineItem>
        <TimelineItem>
          <p>Walk the market</p>
        </TimelineItem>
      </Timeline>,
    )
    const list = screen.getByRole("list", { name: "Day timeline" })
    expect(list).toBeInTheDocument()
    expect(screen.getByText("10:00")).toBeInTheDocument()
    expect(screen.getByText("11:30")).toBeInTheDocument()
    expect(screen.getByText("No time set")).toBeInTheDocument()
    expect(screen.getByText("Lunch")).toBeInTheDocument()
    expect(screen.getByText("Walk the market")).toBeInTheDocument()
  })
})
