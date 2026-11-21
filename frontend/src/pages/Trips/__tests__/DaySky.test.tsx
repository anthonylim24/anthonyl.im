import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { DayForecast } from "../forecast"
import { DaySky } from "../workspace/DaySky"
import { makeItem } from "./tripFixtures"

const hours = (wet: (h: number) => boolean, code: number) =>
  Array.from({ length: 24 }, (_, h) => ({ time: `${String(h).padStart(2, "0")}:00`, tempC: 12, rainChance: wet(h) ? 60 : 10, code: wet(h) ? code : 2 }))

const day = (over: Partial<DayForecast>): DayForecast => ({ date: "2026-07-10", highC: 15, lowC: 8, rainChance: 60, code: 81, ...over })

describe("DaySky", () => {
  it("says when the rain is likely, not only how likely", () => {
    render(<DaySky sky={{ status: "forecast", forecast: day({ hours: hours((h) => h >= 14 && h <= 16, 81) }) }} />)
    expect(screen.getByText(/Showers 2–5 PM/)).toBeInTheDocument()
    expect(screen.getByText(/60% chance$/)).toBeInTheDocument()
  })

  it("names what falls when the day's own word is dry", () => {
    render(<DaySky sky={{ status: "forecast", forecast: day({ code: 3, hours: hours((h) => h === 18, 73) }) }} />)
    expect(screen.getByText(/Overcast · snow 6–7 PM/)).toBeInTheDocument()
  })

  it("gives the day's chance alone when no hour is wet", () => {
    render(<DaySky sky={{ status: "forecast", forecast: day({ code: 3, rainChance: 40 }) }} />)
    expect(screen.getByText(/40% chance of rain/)).toBeInTheDocument()
  })

  it("sets the plan's weather as an estimate and says when there is no forecast", () => {
    const { unmount } = render(<DaySky sky={{ status: "expected", highC: 20, lowC: 12, word: "light rain", sky: "rain" }} />)
    expect(screen.getByText("Estimate · from the plan")).toBeInTheDocument()
    expect(screen.getByText("Light rain")).toBeInTheDocument()
    expect(screen.getByText("About", { exact: false })).toBeInTheDocument()
    unmount()
    const retry = vi.fn()
    render(<DaySky sky={{ status: "unavailable", retry }} />)
    expect(screen.getByText(/Not available right now/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("says which stop the rain meets", () => {
    const forecast = day({ hours: hours((h) => h >= 14 && h <= 16, 81) })
    const lunch = makeItem({ id: "lunch", title: "Lunch", time: "12:30", endTime: "13:30" })
    const walk = makeItem({ id: "walk", title: "Old town walk", time: "15:30", endTime: "18:00" })
    const onStop = vi.fn()
    const onRework = vi.fn()
    const { unmount } = render(
      <DaySky sky={{ status: "forecast", forecast }} day={{ id: "d1", date: "2026-07-10", items: [lunch, walk] }} onStop={onStop} onRework={onRework} />,
    )
    // Off the map the stop is named; the time is when the rain meets it.
    expect(screen.getByRole("figure")).toHaveTextContent("Falls on Old town walk · 3:30–5:00 PM")
    fireEvent.click(screen.getByRole("button", { name: "Old town walk" }))
    expect(onStop).toHaveBeenCalledWith("walk")
    fireEvent.click(screen.getByRole("button", { name: "Rework around the showers" }))
    expect(onRework).toHaveBeenCalledWith(expect.objectContaining({ from: 14 * 60, to: 17 * 60, chance: expect.any(Number) }))
    unmount()
    render(<DaySky sky={{ status: "forecast", forecast }} day={{ id: "d1", date: "2026-07-10", items: [lunch] }} />)
    expect(screen.getByText("After your last stop")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Rework/ })).toBeNull()
  })

  it("offers no rework once the stops it falls on are over", () => {
    const forecast = day({ hours: hours((h) => h >= 14 && h <= 16, 81) })
    const walk = makeItem({ id: "walk", title: "Old town walk", time: "15:30", endTime: "18:00" })
    render(<DaySky sky={{ status: "forecast", forecast }} day={{ id: "d1", date: "2026-07-10", items: [walk] }} now={18 * 60 + 30} onRework={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Rework/ })).toBeNull()
  })
})
