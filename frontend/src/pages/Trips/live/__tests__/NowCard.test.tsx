import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { Trip } from "../../types"
import { NowCard } from "../NowCard"
import { NowLine } from "../NowLine"
import { seoulTrip } from "./liveFixtures"

// Clocks are UTC instants; the trip is in Seoul (UTC+9).
const BASE = "/trips/seoul"

function renderCard(now: Date | undefined, trip: Trip = seoulTrip()) {
  const view = render(
    <MemoryRouter>
      <NowCard trip={trip} basePath={BASE} now={now} />
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
    expect(booking).toHaveTextContent("Tue, May 26 · 10:40")
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
    expect(within(card).getByText("13:42")).toBeInTheDocument()

    expect(within(card).getByText("Gyeongbokgung Palace")).toBeInTheDocument()
    expect(within(card).getByText("14:00")).toBeInTheDocument()
    expect(within(card).getByText("in 18 min")).toBeInTheDocument()
    // Where the walk starts from is part of the line (hidden on phones by CSS).
    expect(within(card).getByText("Leave by 13:46").parentElement).toHaveTextContent(/14 min walk from Bukchon Hanok Village$/)
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
    expect(screen.getByText("until 12:30")).toBeInTheDocument()
  })

  it("says to leave now once the leave time has passed", () => {
    renderCard(new Date("2026-05-28T09:50:00Z")) // 18:50
    expect(screen.getByText("Leave now").parentElement).toHaveTextContent(/18 min by transit from Gyeongbokgung Palace$/)
  })

  it("after the day's last stop, points at tomorrow's first without a countdown", () => {
    renderCard(new Date("2026-05-28T12:00:00Z")) // 21:00
    expect(screen.getByText("08:10").parentElement).toHaveTextContent("First tomorrow · 08:10")
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
