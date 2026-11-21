import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { FAHRENHEIT, type DayForecast } from "../../forecast"
import type { Trip } from "../../types"
import { NowCard, type UpdateDay } from "../NowCard"
import { NowLine } from "../NowLine"
import { place, seoulTrip } from "./liveFixtures"

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
    expect(booking).toHaveAttribute("href", `${BASE}/day/d1#stop-flight`)
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
    expect(within(card).getByRole("link", { name: "Open today" })).toHaveAttribute("href", `${BASE}/day/d3#stop-palace`)
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
    expect(screen.getByRole("link", { name: "Open tomorrow" })).toHaveAttribute("href", `${BASE}/day/d4#stop-ktx`)
  })

  it("says so plainly when today has nothing planned", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = []
    trip.days[3]!.items = []
    renderCard(new Date("2026-05-28T04:42:00Z"), trip)
    expect(screen.getByText("Nothing is planned for today.")).toBeInTheDocument()
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
    expect(within(card).queryByRole("button", { name: "See your recap" })).toBeNull()
  })

  it("opens the recap when the workspace offers one", () => {
    const onOpenRecap = vi.fn()
    renderWith(new Date("2026-06-20T03:00:00Z"), seoulTrip(), { onOpenRecap })
    fireEvent.click(screen.getByRole("button", { name: "See your recap" }))
    expect(onOpenRecap).toHaveBeenCalledTimes(1)
  })
})

/** Day 2 ends at a pinned hotel in Anguk, so day 3 has a bed to go back to. */
function hotelTrip(): Trip {
  const trip = seoulTrip()
  trip.days[1]!.items = [
    place("stay", "Hotel in Anguk", 37.575, { kind: "reservation", time: "15:00", reservation: { type: "hotel", status: "confirmed" } }),
  ]
  return trip
}

function renderWith(now: Date, trip: Trip, props: Partial<ComponentProps<typeof NowCard>>) {
  return render(
    <MemoryRouter>
      <NowCard trip={trip} basePath={BASE} now={now} {...props} />
    </MemoryRouter>,
  )
}

/** Apply the change the card asked for to the trip's own copy of that day. */
function applied(update: ReturnType<typeof vi.fn<UpdateDay>>, trip: Trip, call = 0) {
  const [dayId, change, undo] = update.mock.calls[call]!
  return { day: change(trip.days.find((d) => d.id === dayId)!), dayId, undo }
}

describe("NowCard on the go", () => {
  it("gives a viewer the way around, and no edits", () => {
    const update = vi.fn<UpdateDay>()
    renderWith(new Date("2026-05-28T02:00:00Z"), hotelTrip(), { onUpdateDay: update }) // 11:00, Bukchon under way
    expect(screen.getByRole("link", { name: /^Directions to Gyeongbokgung Palace/ })).toBeInTheDocument()
    const go = screen.getByRole("navigation", { name: "On the go" })
    expect(within(go).getByRole("link", { name: /^Route today through the next 2 stops/ }).getAttribute("href")).toContain("waypoints=")
    expect(within(go).getByRole("link", { name: /^Back to hotel Hotel in Anguk/ }).getAttribute("href")).toContain("37.575")
    expect(within(go).getByRole("link", { name: "Essentials" })).toHaveAttribute("href", `${BASE}?tab=essentials`)
    expect(screen.queryByRole("button", { name: /^Done/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
    expect(screen.queryByRole("link", { name: "Log expense" })).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it("links the stop under way and the next one into the day's list", () => {
    renderCard(new Date("2026-05-28T02:00:00Z"))
    expect(screen.getByRole("link", { name: "Bukchon Hanok Village" })).toHaveAttribute("href", `${BASE}/day/d3#stop-bukchon`)
    expect(screen.getByRole("link", { name: "Gyeongbokgung Palace" })).toHaveAttribute("href", `${BASE}/day/d3#stop-palace`)
  })

  it("marks the stop under way done", () => {
    const update = vi.fn<UpdateDay>()
    const trip = hotelTrip()
    renderWith(new Date("2026-05-28T02:00:00Z"), trip, { canEdit: true, onUpdateDay: update })
    fireEvent.click(screen.getByRole("button", { name: "Done with Bukchon Hanok Village" }))
    const { day, dayId, undo } = applied(update, trip)
    expect(dayId).toBe("d3")
    expect(day.items.find((i) => i.id === "bukchon")!.status).toBe("completed")
    expect(undo).toEqual({ label: "Marked “Bukchon Hanok Village” done", toast: true })
    expect(screen.getByRole("link", { name: "Log expense" })).toHaveAttribute("href", `${BASE}?tab=budget&add=expense`)
  })

  it("skips the next stop, or moves the rest of the day when running late", () => {
    const update = vi.fn<UpdateDay>()
    const trip = hotelTrip()
    renderWith(new Date("2026-05-28T04:42:00Z"), trip, { canEdit: true, onUpdateDay: update }) // 13:42
    const more = screen.getByRole("button", { name: "More for Gyeongbokgung Palace" })

    fireEvent.click(more)
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Mark done",
      "Skip",
      "Running late · 15 min",
      "Running late · 30 min",
      "Running late · 1 hour",
    ])
    fireEvent.click(screen.getByRole("menuitem", { name: "Skip" }))
    expect(applied(update, trip).day.items.find((i) => i.id === "palace")!.status).toBe("skipped")

    fireEvent.click(more)
    fireEvent.click(screen.getByRole("menuitem", { name: "Running late · 30 min" }))
    const late = applied(update, trip, 1)
    expect(late.day.items.find((i) => i.id === "palace")!.time).toBe("14:30")
    expect(late.day.items.find((i) => i.id === "market")!.time).toBe("19:30")
    expect(late.undo).toEqual({ label: "Moved the rest of today 30 min later", toast: true })
  })

  it("offers only the delays the day's clock can hold", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [place("late", "Late show", 37.57, { time: "23:30" })]
    renderWith(new Date("2026-05-28T13:00:00Z"), trip, { canEdit: true, onUpdateDay: vi.fn() }) // 22:00
    fireEvent.click(screen.getByRole("button", { name: "More for Late show" }))
    // 23:45 is still tonight; midnight or later, alone, would read as this morning.
    expect(screen.getByRole("menuitem", { name: "Running late · 15 min" })).toBeEnabled()
    expect(screen.getByRole("menuitem", { name: "Running late · 30 min" })).toBeDisabled()
    expect(screen.getByRole("menuitem", { name: "Running late · 1 hour" })).toBeDisabled()
  })

  it("on a day with no times, offers the first stop not done, with directions", () => {
    const update = vi.fn<UpdateDay>()
    const trip = seoulTrip()
    trip.days[2]!.items = [place("tower", "Namsan Tower", 37.551, { status: "completed" }), place("myeongdong", "Myeongdong", 37.56), place("cheonggye", "Cheonggyecheon", 37.569)]
    renderWith(new Date("2026-05-28T04:42:00Z"), trip, { canEdit: true, onUpdateDay: update })
    expect(screen.getByText("Next · any time today")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Myeongdong" })).toHaveAttribute("href", `${BASE}/day/d3#stop-myeongdong`)
    expect(screen.getByRole("link", { name: /^Directions to Myeongdong/ })).toBeInTheDocument()
    expect(screen.queryByText(/^in /)).toBeNull()
    // The rest of the list, in its order.
    expect(screen.getByRole("link", { name: /^Route today through the next 2 stops/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "More for Myeongdong" }))
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Mark done", "Skip"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark done" }))
    expect(applied(update, trip).day.items.find((i) => i.id === "myeongdong")!.status).toBe("completed")
  })

  it("says so when everything on a day with no times is done", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [place("tower", "Namsan Tower", 37.551, { status: "completed" })]
    trip.days[3]!.items = []
    renderCard(new Date("2026-05-28T04:42:00Z"), trip)
    expect(screen.getByText("Everything on today’s list is done.")).toBeInTheDocument()
  })

  it("stays on the night's last stops after midnight", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [
      place("dinner", "Dinner in Euljiro", 37.566, { time: "19:00", endTime: "21:00" }),
      place("bar", "Bar in Euljiro", 37.567, { time: "23:00" }),
      place("club", "Club in Hongdae", 37.556, { time: "01:00", endTime: "04:00" }),
    ]
    renderCard(new Date("2026-05-28T15:30:00Z"), trip, new Map([["d3", SHOWERY]])) // 00:30 on the 29th
    const card = screen.getByRole("region", { name: "Tonight · Day 3 of 12" })
    expect(within(card).getByRole("img", { name: "Thu, May 28" })).toBeInTheDocument()
    expect(within(card).getByText("12:30 AM")).toBeInTheDocument()
    expect(within(card).getByText("Now")).toBeInTheDocument()
    expect(within(card).getByRole("link", { name: "Bar in Euljiro" })).toBeInTheDocument()
    expect(within(card).getByText("1:00 AM").parentElement).toHaveTextContent("Next · 1:00 AM")
    expect(within(card).getByText("in 30 min")).toBeInTheDocument()
    // Yesterday's forecast is no guide to the small hours.
    expect(screen.queryByTitle("Forecast from Open-Meteo")).toBeNull()
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
