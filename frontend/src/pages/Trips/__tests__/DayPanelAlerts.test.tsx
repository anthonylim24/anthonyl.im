import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { DayForecast } from "../forecast"
import type { TripDay } from "../types"
import { DayPanel, type DayPanelProps } from "../workspace/DayPanel"
import { makeItem, makeTrip } from "./tripFixtures"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  const panel = (day: TripDay, weather = sky, more: Partial<DayPanelProps> = {}) => (
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
        {...more}
      />
    </MemoryRouter>
  )
  const view = render(panel(day))
  return { ...view, rerenderDay: (next: TripDay, weather = sky, more: Partial<DayPanelProps> = {}) => view.rerender(panel(next, weather, more)) }
}

const lunch = makeItem({ id: "it-lunch", title: "Lunch", time: "12:30", endTime: "13:30" })
const walk = makeItem({ id: "it-walk", title: "Old town walk", time: "15:30", endTime: "18:00" })

describe("DayPanel list warnings", () => {
  it("puts the rain line on the stop that meets the wet spell", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [lunch, walk] }, { status: "forecast", forecast: SHOWERY })
    expect(document.getElementById("item-it-walk")).toHaveTextContent(/Showers until 5(:00)? PM · 60%/)
    expect(document.getElementById("item-it-lunch")).not.toHaveTextContent(/Showers/)
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
/** The leg line drawn above a stop, from the one before it. */
const legInto = (id: string) => document.getElementById(`item-${id}`)!.closest("li")!.querySelector(":scope > [aria-hidden]")?.textContent

describe("DayPanel list legs", () => {
  it("says there is no time to travel when the next stop starts before this one ends", () => {
    const castle = pinned("Castle", 0, "10:15", "11:30")
    const tram = pinned("Tram", 0.5, "11:00", "12:00")
    const lunch = pinned("Lunch", 1.4, "12:30", "13:30")
    renderDay({ id: "day-1", date: "2026-07-10", items: [castle, tram, lunch] }, { status: "none" })
    expect(legInto("Tram")).toBe("No time to travel")
    expect(legInto("Lunch")).toMatch(/^900 m\u00a0· \d+ min walk\u00a0· \d+ min free/)
  })

  it("matches the overlap when the list is out of clock order", () => {
    const tram = pinned("Tram", 0.5, "11:00", "12:00")
    const castle = pinned("Castle", 0, "10:15", "11:30")
    renderDay({ id: "day-1", date: "2026-07-10", items: [tram, castle] }, { status: "none" })
    expect(legInto("Castle")).toBe("No time to travel")
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
    expect(document.getElementById("item-it-tea")).toHaveTextContent("Showers likely · 60%")
    expect(document.getElementById("item-it-walk")).toHaveTextContent(/Showers until 5(:00)? PM · 60%/)
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
    expect(legInto("Tram")).toMatch(/ walk/)
    expect(legInto("Bookshop")).toBeUndefined()
    expect(screen.queryByText("––")).toBeNull()
  })

  it("is not drawn on a day with no times", () => {
    renderDay({ id: "day-1", date: "2026-07-10", items: [makeItem({ id: "a", title: "A" }), makeItem({ id: "b", title: "B" })] }, { status: "none" })
    expect(screen.queryByRole("heading", { name: "Anytime" })).toBeNull()
  })
})

/** Lisbon runs on UTC+1 in July. */
const at = (lisbon: string) => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(`2026-07-10T${lisbon}:00+01:00`))
}

describe("DayPanel today", () => {
  const breakfast = pinned("Breakfast", 0, "09:00", "10:00")
  const lunch = pinned("Lunch", 0.3, "12:30", "13:30")
  const walk = pinned("Walk", 1.24, "15:30", "18:00")
  const today = { id: "day-1", date: "2026-07-10", items: [breakfast, lunch, walk] }
  const shown = () => [...document.querySelectorAll("[id^='item-']")].map((card) => card.id.slice(5))

  it("folds the stops already over into one row that opens them again", () => {
    at("14:10")
    renderDay(today, { status: "none" })
    expect(shown()).toEqual(["Walk"])
    const fold = screen.getByRole("button", { name: /^2 stops done/ })
    expect(fold).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(fold)
    expect(shown()).toEqual(["Breakfast", "Lunch", "Walk"])
    expect(fold).toHaveAttribute("aria-expanded", "true")
  })

  it("draws Now before the leg it leads into, with the free time and when to leave", () => {
    at("14:10")
    renderDay(today, { status: "none" })
    const now = screen.getByRole("separator", { name: /^Now/ })
    const card = document.getElementById("item-Walk")!.closest("li")!
    expect(now.nextElementSibling).toBe(card)
    expect(legInto("Walk")).toBe("940 m\u00a0· 12 min walk\u00a0· 1 h 08 freeLeave by 3:18 PM")
  })

  it("keeps the fold open for a stop in it that is selected", () => {
    at("14:10")
    renderDay(today, { status: "none" }, { activeId: "Lunch" })
    expect(shown()).toEqual(["Breakfast", "Lunch", "Walk"])
    expect(screen.getByRole("button", { name: /^2 stops done/ })).toHaveAttribute("aria-expanded", "true")
  })

  it("opens for a stop the map asks to edit", () => {
    at("14:10")
    const { rerenderDay } = renderDay(today, { status: "none" })
    expect(shown()).toEqual(["Walk"])
    rerenderDay(today, { status: "none" }, { edit: { id: "Breakfast", n: 1 } })
    expect(shown()).toEqual(["Breakfast", "Lunch", "Walk"])
  })

  it("keeps the folded head in place when the rest is reordered", () => {
    at("14:10")
    const onChange = vi.fn()
    const tea = pinned("Tea", 1.3, "16:00", "17:00")
    renderDay({ ...today, items: [breakfast, lunch, walk, tea] }, { status: "none" }, { editable: true, onChange })
    const row = document.getElementById("item-Tea")!.querySelector<HTMLElement>("[data-card-row]")!
    fireEvent.keyDown(row, { key: "ArrowUp", altKey: true })
    const [edit] = onChange.mock.calls[0]!
    const [next] = edit([{ ...today, items: [breakfast, lunch, walk, tea] }])
    expect(next.items.map((item: { id: string }) => item.id)).toEqual(["Breakfast", "Lunch", "Tea", "Walk"])
  })

  it("does not fold before the first stop ends, or on another day", () => {
    at("09:30")
    renderDay(today, { status: "none" })
    expect(screen.queryByRole("button", { name: /stops? done/ })).toBeNull()
    expect(shown()).toEqual(["Breakfast", "Lunch", "Walk"])
  })
})

describe("DayPanel conflicts", () => {
  it("names the earlier stop by its number on the map", () => {
    const castle = pinned("Castle", 0, "10:15", "11:30")
    const tram = pinned("Tram", 0.5, "11:00", "12:00")
    renderDay({ id: "day-1", date: "2026-07-10", items: [castle, tram] }, { status: "none" })
    const card = document.getElementById("item-Tram")!
    expect(within(card).getByRole("img", { name: "stop 1" })).toHaveTextContent("1")
    expect(card).toHaveTextContent("Overlaps 1")
  })

  it("says how tight a leg is after the stop it follows", () => {
    const castle = pinned("Castle", 0, "10:00", "11:00")
    const far = pinned("Far", 6, "11:00", "12:00")
    renderDay({ id: "day-1", date: "2026-07-10", items: [castle, far] }, { status: "none" })
    expect(document.getElementById("item-Far")).toHaveTextContent(/Tight after 1 · ~\d+ min by transit, no gap/)
  })
})
