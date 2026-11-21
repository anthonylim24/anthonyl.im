import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { FAHRENHEIT, type DayForecast } from "../../forecast"
import type { Trip } from "../../types"
import { NowCard } from "../NowCard"
import { NowLine } from "../NowLine"
import { seoulTrip } from "./liveFixtures"

// Clocks are UTC instants; the trip is in Seoul (UTC+9).
const BASE = "/trips/seoul"

function renderCard(now: Date | undefined, trip: Trip = seoulTrip(), forecast?: ReadonlyMap<string, DayForecast>) {
  const view = render(
    <MemoryRouter>
      <NowCard trip={trip} basePath={BASE} now={now} forecast={forecast} />
    </MemoryRouter>,
  )
  return {
    ...view,
    at: (next: Date) =>
      view.rerender(
        <MemoryRouter>
          <NowCard trip={trip} basePath={BASE} now={next} />
        </MemoryRouter>,
      ),
  }
}

describe("NowCard before the trip", () => {
  it("counts down to the first day and links the first booking", () => {
    renderCard(new Date("2026-05-03T03:00:00Z"))
    const card = screen.getByRole("region", { name: "Starts in 23 days" })
    expect(within(card).getByText("May 26 – Jun 6, 2026 · 12 days")).toBeInTheDocument()
    expect(within(card).getByRole("img", { name: "Tue, May 26" })).toBeInTheDocument()

    const booking = within(card).getByRole("link", { name: /First booking/ })
    expect(booking).toHaveTextContent("Flight UA 893")
    expect(booking).toHaveTextContent("Tue, May 26 · 10:40 AM")
    expect(booking).toHaveAttribute("href", `${BASE}/day/d1#item-flight`)
  })

  it("says tomorrow on the eve of the trip", () => {
    renderCard(new Date("2026-05-25T03:00:00Z"))
    expect(screen.getByRole("region", { name: "Starts tomorrow" })).toBeInTheDocument()
  })
})

describe("NowCard during the trip", () => {
  it("leads with the next stop: time, countdown, when to leave, and the way there", () => {
    renderCard(new Date("2026-05-28T04:42:00Z")) // 13:42
    const card = screen.getByRole("region", { name: "Today · Day 3 of 12" })
    expect(within(card).getByRole("img", { name: "Thu, May 28" })).toBeInTheDocument()
    expect(within(card).getByText("1:42 PM")).toBeInTheDocument()

    expect(within(card).getByText("Gyeongbokgung Palace")).toBeInTheDocument()
    expect(within(card).getByText("2:00 PM")).toBeInTheDocument()
    expect(within(card).getByText("in 18 min")).toBeInTheDocument()
    // Where the walk starts from is part of the line (hidden on phones by CSS).
    expect(within(card).getByText("Leave by 1:46 PM").parentElement).toHaveTextContent(/14 min walk from Bukchon Hanok Village$/)
    // Nothing is under way between stops.
    expect(within(card).queryByText("Now")).toBeNull()

    const directions = within(card).getByRole("link", { name: /^Directions to Gyeongbokgung Palace/ })
    expect(directions).toHaveAttribute("target", "_blank")
    expect(directions.getAttribute("href")).toContain("37.59")
    expect(within(card).getByRole("link", { name: "Open today" })).toHaveAttribute("href", `${BASE}/day/d3#item-palace`)
    expect(within(card).getByText("2 of 4 started")).toBeInTheDocument()
  })

  it("names the stop under way and when it ends", () => {
    renderCard(new Date("2026-05-28T02:00:00Z")) // 11:00
    expect(screen.getByText("Now")).toBeInTheDocument()
    expect(screen.getByText("Bukchon Hanok Village")).toBeInTheDocument()
    expect(screen.getByText("until 12:30 PM")).toBeInTheDocument()
  })

  it("says to leave now once the leave time has passed", () => {
    renderCard(new Date("2026-05-28T09:50:00Z")) // 18:50
    expect(screen.getByText("Leave now").parentElement).toHaveTextContent(/18 min by transit from Gyeongbokgung Palace$/)
  })

  it("after the day's last stop, points at tomorrow's first without a countdown", () => {
    renderCard(new Date("2026-05-28T12:00:00Z")) // 21:00
    expect(screen.getByText("8:10 AM").parentElement).toHaveTextContent("First tomorrow · 8:10 AM")
    expect(screen.getByText("KTX to Busan")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("First tomorrow: KTX to Busan")
    expect(screen.queryByText(/^in /)).toBeNull()
    expect(screen.queryByText(/Leave/)).toBeNull()
    expect(screen.getByRole("link", { name: "Open tomorrow" })).toHaveAttribute("href", `${BASE}/day/d4#item-ktx`)
  })

  it("says so when nothing on today's plan has a time", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = []
    trip.days[3]!.items = []
    renderCard(new Date("2026-05-28T04:42:00Z"), trip)
    expect(screen.getByText("Nothing on today’s plan has a time.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open today" })).toHaveAttribute("href", `${BASE}/day/d3`)
  })

  it("announces a new next stop, not the minute ticking by", () => {
    const { at } = renderCard(new Date("2026-05-28T04:42:00Z"))
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("Next: Gyeongbokgung Palace")

    at(new Date("2026-05-28T04:43:00Z"))
    expect(screen.getByText("in 17 min")).toBeInTheDocument()
    expect(status).toHaveTextContent("Next: Gyeongbokgung Palace")
    expect(status).not.toHaveTextContent(/min/)

    at(new Date("2026-05-28T05:01:00Z")) // 14:01
    expect(status).toHaveTextContent("Next: Gwangjang Market")
  })
})

/** Day 3 (May 28): partly cloudy, 15 °C all day, showers likely 14:00 to 17:00. */
const SHOWERY: DayForecast = {
  date: "2026-05-28",
  highC: 18,
  lowC: 9,
  rainChance: 60,
  code: 2,
  hours: Array.from({ length: 24 }, (_, h) => ({
    time: `${String(h).padStart(2, "0")}:00`,
    tempC: 15,
    rainChance: h >= 14 && h <= 16 ? 60 : 10,
    code: h >= 14 && h <= 16 ? 81 : 2,
  })),
}
const deg = (c: number, f: number) => `${FAHRENHEIT ? f : c}°`

describe("NowCard sky line", () => {
  it("gives this hour's temperature and the wet spell still to come", () => {
    renderCard(new Date("2026-05-28T04:42:00Z"), seoulTrip(), new Map([["d3", SHOWERY]])) // 13:42
    expect(screen.getByTitle("Forecast from Open-Meteo")).toHaveTextContent(`${deg(15, 59)} now · Showers 2–5 PM`)
  })

  it("says when the spell ends while it is under way", () => {
    renderCard(new Date("2026-05-28T06:30:00Z"), seoulTrip(), new Map([["d3", SHOWERY]])) // 15:30
    expect(screen.getByTitle("Forecast from Open-Meteo")).toHaveTextContent(`${deg(15, 59)} now · Showers until 5 PM`)
  })

  it("says the day's sky once the spell is over", () => {
    renderCard(new Date("2026-05-28T09:50:00Z"), seoulTrip(), new Map([["d3", SHOWERY]])) // 18:50
    expect(screen.getByTitle("Forecast from Open-Meteo")).toHaveTextContent(`${deg(15, 59)} now · Partly cloudy`)
  })

  it("names the high when there are no hours", () => {
    renderCard(new Date("2026-05-28T04:42:00Z"), seoulTrip(), new Map([["d3", { ...SHOWERY, hours: undefined }]]))
    expect(screen.getByTitle("Forecast from Open-Meteo")).toHaveTextContent(`High ${deg(18, 64)} · Partly cloudy`)
  })

  it("draws nothing without today's forecast", () => {
    renderCard(new Date("2026-05-28T04:42:00Z"), seoulTrip(), new Map([["d4", SHOWERY]]))
    expect(screen.queryByTitle("Forecast from Open-Meteo")).toBeNull()
  })
})

describe("NowCard after the trip", () => {
  it("recaps the trip in one line", () => {
    renderCard(new Date("2026-06-20T03:00:00Z"))
    const card = screen.getByRole("region", { name: "Ended 2 weeks ago · May 26 – Jun 6, 2026" })
    expect(within(card).getByText("12 days · 8 places · 2 cities")).toBeInTheDocument()
  })
})

describe("NowCard on the real clock", () => {
  let hidden = false
  afterEach(() => {
    vi.useRealTimers()
    hidden = false
  })

  it("moves on the minute, and not at all while the tab is hidden", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-05-28T04:42:30Z")) // 13:42:30
    renderCard(undefined)
    expect(screen.getByText("in 18 min")).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(31_000))
    expect(screen.getByText("in 17 min")).toBeInTheDocument()

    hidden = true
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(screen.getByText("in 17 min")).toBeInTheDocument()

    hidden = false
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(screen.getByText("in 12 min")).toBeInTheDocument()
  })
})

describe("NowLine", () => {
  it("is a labelled separator in the stop list", () => {
    render(
      <ol>
        <NowLine time="13:42" />
      </ol>,
    )
    const line = screen.getByRole("separator", { name: "Now, 13:42" })
    expect(line.tagName).toBe("LI")
    expect(line).toHaveTextContent("Now · 13:42")
  })
})
