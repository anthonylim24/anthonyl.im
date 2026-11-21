import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { FAHRENHEIT, type DayForecast } from "../forecast"
import { todayIsoIn } from "../meta"
import { OverviewPanel } from "../workspace/OverviewPanel"
import { makeItem, makeTrip } from "./tripFixtures"

const today = todayIsoIn("UTC")
const forecast = (rainChance: number): DayForecast => ({ date: today, highC: 15, lowC: 8, rainChance, code: 81 })

function renderOverview(rainChance: number) {
  const trip = makeTrip({
    timezone: "UTC",
    startDate: today,
    endDate: today,
    days: [{ id: "day-1", date: today, title: "A very long day title that runs well past the edge of a phone", items: [makeItem()] }],
  })
  const noop = vi.fn()
  render(
    <MemoryRouter>
      <OverviewPanel
        trip={trip}
        forecast={new Map([["day-1", forecast(rainChance)]])}
        basePath="/trips/lisbon"
        editable={false}
        locked={false}
        drafting={false}
        enhancing={false}
        applying={false}
        run={null}
        dayOptions={[]}
        onDraft={noop}
        onHoverDay={noop}
        onApplyRun={noop}
        onDismissRun={noop}
        onStopAi={noop}
      />
    </MemoryRouter>,
  )
  return screen.getByRole("link", { name: /A very long day title/ })
}

describe("OverviewPanel day rows", () => {
  it("says Today in the date tile, out of reach of the title's truncation", () => {
    const row = renderOverview(10)
    expect(within(row).getByText("Today")).toBeInTheDocument()
    expect(within(row).getByText(/A very long day title/)).not.toHaveTextContent("Today")
  })

  it("shows the high over the low, and the chance of rain only from 30%", () => {
    const [high, low] = FAHRENHEIT ? ["59°", "46°"] : ["15°", "8°"]
    const row = renderOverview(60)
    expect(within(row).getByText(high)).toBeInTheDocument()
    expect(within(row).getByText(low)).toBeInTheDocument()
    expect(within(row).getByText("60% rain")).toBeInTheDocument()
    expect(within(row).getByText(`${high} / ${low} · Showers 60%`)).toBeInTheDocument()
  })

  it("leaves a low chance of rain out", () => {
    const row = renderOverview(20)
    expect(within(row).queryByText(/20%/)).toBeNull()
  })
})
