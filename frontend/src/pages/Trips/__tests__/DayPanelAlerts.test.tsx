import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { DayForecast } from "../forecast"
import type { TripDay } from "../types"
import { DayPanel, type DayPanelProps } from "../workspace/DayPanel"
import { scrollUnderRail } from "../workspace/scroll"
import { makeItem, makeTrip } from "./tripFixtures"

vi.mock("../workspace/scroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace/scroll")>()),
  scrollUnderRail: vi.fn(),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.mocked(scrollUnderRail).mockClear()
})

/** Showers (WMO 81) likely from 14:00 to 17:00, dry otherwise. */
const SHOWERY: DayForecast = {
  date: "2026-07-10",
  highC: 15,
  lowC: 8,
  rainChance: 60,
  code: 81,
  hours: Array.from({ length: 24 }, (_, h) => ({
    time: `${String(h).padStart(2, "0")}:00`,
    tempC: 12,
    rainChance: h >= 14 && h <= 16 ? 60 : 10,
    code: h >= 14 && h <= 16 ? 81 : 2,
  })),
}

function renderDay(day: TripDay, sky: DayPanelProps["sky"], props: Partial<DayPanelProps> = {}) {
  const trip = makeTrip({ days: [day] })
  const noop = vi.fn()
  const panel = (day: TripDay, weather = sky) => (
    <MemoryRouter>
      <DayPanel
        trip={trip}
        day={day}
        dayIndex={0}
        basePath="/trips/lisbon"
        editable={false}
        locked={false}
        enhancing={false}
        applying={false}
        run={null}
        dayOptions={[]}
        recentIds={new Set()}
        hotId={null}
        activeId={null}
        edit={null}
        near={null}
        onChange={noop}
        onDelete={noop}
        onAdded={noop}
        onHover={noop}
        onLocate={noop}
        onAskAi={noop}
        onClear={noop}
        onApplyRun={noop}
        onDismissRun={noop}
        onStopAi={noop}
        sky={weather}
        {...props}
      />
    </MemoryRouter>
  )
  const view = render(panel(day))
  return { ...view, rerenderDay: (next: TripDay, weather = sky) => view.rerender(panel(next, weather)) }
}

/** Long enough for the open-on-Now scroll to have run: it waits a frame or two for the day to hold still. */
const frames = () => new Promise((done) => setTimeout(done, 200))

const lunch = makeItem({ id: "it-lunch", title: "Lunch", time: "12:30", endTime: "13:30" })
const walk = makeItem({ id: "it-walk", title: "Old town walk", time: "15:30", endTime: "18:00" })

describe("DayPanel list warnings", () => {
  it("puts the rain line on the stop that meets the wet spell", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, walk] }, { status: "forecast", forecast: SHOWERY })
    const line = screen.getByText("Showers likely · 60% chance")
    expect(line.closest("[id^='item-']")).toHaveAttribute("id", "item-it-walk")
    expect(within(document.getElementById("item-it-lunch")!).queryByText(/likely/)).toBeNull()
  })

  it("says nothing about rain without a live forecast", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, walk] }, { status: "none" })
    expect(screen.queryByText(/likely ·/)).toBeNull()
  })
})

const LISBON = { lat: 38.71, lng: -9.14 }
/** A pinned stop `km` north of the centre. */
const pinned = (id: string, km: number, time: string, endTime: string) =>
  makeItem({ id, title: id, time, endTime, location: { name: id, lat: LISBON.lat + km / 111.195, lng: LISBON.lng, source: "user" } })
/** The leg line drawn under a stop, toward the next one. */
const legUnder = (id: string) => document.getElementById(`item-${id}`)!.closest("li")!.querySelector(":scope > [aria-hidden]")?.textContent

describe("DayPanel list legs", () => {
  it("says there is no time to travel when the next stop starts before this one ends", () => {
    const castle = pinned("Castle", 0, "10:15", "11:30")
    const tram = pinned("Tram", 0.5, "11:00", "12:00")
    const lunch = pinned("Lunch", 1.4, "12:30", "13:30")
    renderDay({ id: "day-1", date: "2026-07-10", items: [castle, tram, lunch] }, { status: "none" })
    expect(legUnder("Castle")).toBe("No time to travel")
    expect(legUnder("Tram")).toMatch(/^900 m · \d+ min walk$/)
  })

  it("matches the overlap when the list is out of clock order", () => {
    const tram = pinned("Tram", 0.5, "11:00", "12:00")
    const castle = pinned("Castle", 0, "10:15", "11:30")
    renderDay({ id: "day-1", date: "2026-07-10", items: [tram, castle] }, { status: "none" })
    expect(legUnder("Tram")).toBe("No time to travel")
  })
})

describe("DayPanel rework around the rain", () => {
  it("asks Ideas to rework the day around the wet window", () => {
    const onAskAi = vi.fn()
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, walk] }, { status: "forecast", forecast: SHOWERY }, { editable: true, onAskAi })
    const card = document.getElementById("item-it-walk")!.closest("li")!
    fireEvent.click(within(card).getByRole("button", { name: "Rework around the showers" }))
    expect(onAskAi).toHaveBeenCalledWith(expect.stringMatching(/^Showers likely 2–5 PM \(60% chance\)\. .*indoor/))
    expect(screen.getAllByRole("button", { name: "Rework around the showers" })).toHaveLength(1)
  })

  it("offers it once per wet spell, on the first stop that meets it", () => {
    const tea = makeItem({ id: "it-tea", title: "Tea", time: "14:15", endTime: "15:00" })
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, tea, walk] }, { status: "forecast", forecast: SHOWERY }, { editable: true })
    expect(screen.getAllByText("Showers likely · 60% chance")).toHaveLength(2)
    const [only] = screen.getAllByRole("button", { name: "Rework around the showers" })
    expect(only!.closest("li")).toBe(document.getElementById("item-it-tea")!.closest("li"))
    expect(screen.getAllByRole("button", { name: "Rework around the showers" })).toHaveLength(1)
  })

  it("is not offered on a trip the traveller cannot edit", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, walk] }, { status: "forecast", forecast: SHOWERY })
    expect(screen.queryByRole("button", { name: "Rework around the showers" })).toBeNull()
  })
})

describe("DayPanel Anytime", () => {
  it("heads the untimed stops after the last timed one, with no time and no leg into them", () => {
    const castle = pinned("Castle", 0, "10:15", "11:30")
    const tram = pinned("Tram", 0.5, "12:00", "13:00")
    const bookshop = makeItem({ id: "Bookshop", title: "Bookshop", location: { name: "Bookshop", lat: LISBON.lat + 1 / 111.195, lng: LISBON.lng, source: "user" } })
    renderDay({ id: "day-1", date: "2026-07-10", items: [castle, tram, bookshop] }, { status: "none" })
    const heading = screen.getByRole("heading", { name: "Anytime" })
    expect(heading.closest("li")!.nextElementSibling!.querySelector("#item-Bookshop")).not.toBeNull()
    expect(legUnder("Castle")).toMatch(/ walk$/)
    expect(legUnder("Tram")).toBeUndefined()
    expect(screen.queryByText("––")).toBeNull()
  })

  it("is not drawn on a day with no times", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [makeItem({ id: "a", title: "A" }), makeItem({ id: "b", title: "B" })] }, { status: "none" })
    expect(screen.queryByRole("heading", { name: "Anytime" })).toBeNull()
  })
})

describe("DayPanel opening today", () => {
  const breakfast = makeItem({ id: "it-breakfast", title: "Breakfast", time: "09:00", endTime: "10:00" })
  const today = { id: "day-1", date: "2026-07-10", items: [breakfast, lunch, walk] }
  /** Lisbon runs on UTC+1 in July. */
  const at = (lisbon: string) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(`2026-07-10T${lisbon}:00+01:00`))
    // happy-dom lays nothing out; every element counts as showing.
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as unknown as DOMRectList)
  }

  it("scrolls past what is done to Now", async () => {
    at("14:00")
    renderDay(today, { status: "none" })
    await waitFor(() => expect(scrollUnderRail).toHaveBeenCalledTimes(1))
    expect(scrollUnderRail).toHaveBeenCalledWith(document.querySelector("[data-now]"))
  })

  it("lands on the stop under way when it fits", async () => {
    at("13:00")
    renderDay(today, { status: "none" })
    await waitFor(() => expect(scrollUnderRail).toHaveBeenCalledWith(document.getElementById("item-it-lunch")))
  })

  it("scrolls once per visit to the day", async () => {
    at("14:00")
    const { rerenderDay } = renderDay(today, { status: "none" })
    await waitFor(() => expect(scrollUnderRail).toHaveBeenCalledTimes(1))
    rerenderDay({ ...today, items: [...today.items, makeItem({ id: "it-late", title: "Late" })] })
    await frames()
    expect(scrollUnderRail).toHaveBeenCalledTimes(1)
  })

  it("leaves the page alone when a stop is already selected", async () => {
    at("14:00")
    renderDay(today, { status: "none" }, { activeId: "it-walk" })
    await frames()
    expect(scrollUnderRail).not.toHaveBeenCalled()
  })

  it("waits for the forecast, which changes the height above Now", async () => {
    at("14:00")
    const { rerenderDay } = renderDay(today, { status: "loading" })
    await frames()
    expect(scrollUnderRail).not.toHaveBeenCalled()
    rerenderDay(today, { status: "forecast", forecast: SHOWERY })
    await waitFor(() => expect(scrollUnderRail).toHaveBeenCalledTimes(1))
  })

  it("leaves a page the traveller has already moved", async () => {
    at("14:00")
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200)
    renderDay(today, { status: "none" })
    await frames()
    expect(scrollUnderRail).not.toHaveBeenCalled()
  })

  it("leaves the page alone before the first stop ends", async () => {
    at("09:30")
    renderDay(today, { status: "none" })
    await frames()
    expect(scrollUnderRail).not.toHaveBeenCalled()
  })
})
