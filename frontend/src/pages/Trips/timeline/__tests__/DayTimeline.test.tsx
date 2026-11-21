import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { TO_SCHEDULE } from "../../map/geo"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { DayTimeline } from "../DayTimeline"

const SEOUL = { lat: 37.57, lng: 126.98 }
const north = (km: number) => ({ lat: SEOUL.lat + km / 111.195, lng: SEOUL.lng })

function place(id: string, title: string, time: string | undefined, point: { lat: number; lng: number } | null, overrides: Partial<ItineraryItem> = {}) {
  const { location, ...rest } = overrides
  return makeItem({
    id,
    title,
    time,
    ...(point ? { location: { name: title, source: "user" as const, ...location, lat: point.lat, lng: point.lng } } : {}),
    ...rest,
  })
}

const flight = place("flight", "UA 893", "10:40", SEOUL, {
  kind: "reservation",
  endTime: "13:00",
  reservation: { type: "flight", status: "confirmed" },
})
const palace = place("palace", "Gyeongbokgung", "14:00", north(2), { endTime: "16:00", location: { name: "Gyeongbokgung", category: "palace", source: "user" } })
const tea = place("tea", "Tea house", "15:00", north(2.2), { location: { name: "Tea house", category: "cafe", source: "user" } })
const dinner = place("dinner", "Dinner", "18:00", north(12))
const bar = place("bar", "Sunset bar", undefined, north(3))
const parking = makeItem({ id: "parking", kind: "section", title: TO_SCHEDULE })
const market = place("market", "Night market", "19:00", north(4))

function dayWith(items: ItineraryItem[]): TripDay {
  return { id: "day-1", date: "2026-07-10", items }
}

function renderTimeline(items: ItineraryItem[] = [flight, palace, tea, dinner, bar, parking, market], props: { activeId?: string | null; hotId?: string | null; now?: string } = {}) {
  const day = dayWith(items)
  const trip = makeTrip({ days: [day, { id: "day-2", date: "2026-07-11", items: [] }] })
  const onSelect = vi.fn()
  const onHover = vi.fn()
  const view = render(
    <DayTimeline trip={trip} day={day} activeId={props.activeId ?? null} hotId={props.hotId ?? null} onSelect={onSelect} onHover={onHover} now={props.now} />,
  )
  return { ...view, onSelect, onHover }
}

const stopNamed = (name: string | RegExp) => screen.getByRole("button", { name })

describe("DayTimeline", () => {
  it("names every timed stop by its time, title, kind and map number", () => {
    renderTimeline()
    const clock = screen.getByRole("list", { name: "4 stops on the clock" })
    const names = within(clock)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
    expect(names).toEqual([
      "10:40 AM to 1:00 PM, UA 893, flight, stop 1",
      "2:00 PM to 4:00 PM, Gyeongbokgung, palace, stop 2",
      "3:00 PM, Tea house, cafe, stop 3",
      "6:00 PM, Dinner, stop 4",
    ])
  })

  it("describes guessed lengths, the leg in, and what to check", () => {
    renderTimeline()
    expect(stopNamed(/Dinner/)).toHaveAccessibleDescription("Length estimated, about 1 h. About 35 min by transit from Gyeongbokgung")
    expect(stopNamed(/Tea house/)).toHaveAccessibleDescription("Length estimated, about 45 min. Overlaps Gyeongbokgung")
    // Beside the stop it overlaps the lane is narrow: the warning names it by its number.
    expect(screen.getByText(/^Overlaps stop \d+$/)).toBeInTheDocument()
    expect(screen.getByText("1 overlap")).toBeInTheDocument()
  })

  it("labels the leg between two stops, and free time worth knowing about", () => {
    renderTimeline()
    expect(screen.getByText("≈ 35 min by transit")).toBeInTheDocument()
    expect(screen.getByText("1 h 25 free")).toBeInTheDocument()
    expect(screen.getByText("2 h 25 free")).toBeInTheDocument()
    expect(screen.getByText("leave 5:25 PM")).toBeInTheDocument()
  })

  it("counts no free time once the day's stops are over", () => {
    renderTimeline(undefined, { now: "23:30" })
    expect(screen.getByText(/^\d+ timed stops$/)).toBeInTheDocument()
    expect(screen.queryByText(/free/)).toBeNull()
  })

  it("measures no leg out of a flight, which lands somewhere else", () => {
    renderTimeline()
    expect(screen.getByText("1 h free")).toBeInTheDocument()
    expect(stopNamed(/Gyeongbokgung/)).toHaveAccessibleDescription("")
    expect(screen.queryByText(/by transit from UA 893/)).toBeNull()
  })

  it("lists untimed stops and places to schedule under Anytime, keeping their map numbers", () => {
    renderTimeline()
    const anytime = screen.getByRole("region", { name: "Anytime" })
    expect(
      within(anytime)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Anytime, Sunset bar, stop 5", "To schedule, Night market"])
  })

  it("keeps one tab stop and moves it with the arrow keys, through Anytime", () => {
    renderTimeline()
    const buttons = screen.getAllByRole("button")
    expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([stopNamed(/UA 893/)])

    stopNamed(/UA 893/).focus()
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    expect(stopNamed(/Gyeongbokgung/)).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    expect(stopNamed(/Sunset bar/)).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" })
    expect(stopNamed(/Dinner/)).toHaveFocus()
    expect(stopNamed(/Dinner/).tabIndex).toBe(0)
    fireEvent.keyDown(document.activeElement!, { key: "End" })
    expect(stopNamed(/Night market/)).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    expect(stopNamed(/Night market/)).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "Home" })
    expect(stopNamed(/UA 893/)).toHaveFocus()
  })

  it("starts the tab stop on the selected stop", () => {
    renderTimeline(undefined, { activeId: "palace" })
    expect(stopNamed(/Gyeongbokgung/).tabIndex).toBe(0)
    expect(stopNamed(/Gyeongbokgung/)).toHaveAttribute("aria-current", "true")
    expect(stopNamed(/UA 893/).tabIndex).toBe(-1)
  })

  it("selects on click and on Enter", () => {
    const { onSelect } = renderTimeline()
    fireEvent.click(stopNamed(/Tea house/))
    expect(onSelect).toHaveBeenLastCalledWith("tea")
    stopNamed(/Sunset bar/).focus()
    fireEvent.keyDown(stopNamed(/Sunset bar/), { key: "Enter" })
    expect(onSelect).toHaveBeenLastCalledWith("bar")
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it("reports hover and focus so the map can lift the pin", () => {
    const { onHover } = renderTimeline()
    fireEvent.mouseEnter(stopNamed(/Gyeongbokgung/))
    expect(onHover).toHaveBeenLastCalledWith("palace")
    fireEvent.mouseLeave(stopNamed(/Gyeongbokgung/))
    expect(onHover).toHaveBeenLastCalledWith(null)
    fireEvent.focus(stopNamed(/UA 893/))
    expect(onHover).toHaveBeenLastCalledWith("flight")
    fireEvent.blur(stopNamed(/UA 893/))
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it("draws the now line only when now falls on the ruler", () => {
    const { rerender, container } = renderTimeline(undefined, { now: "14:30" })
    expect(screen.getByText("Now 2:30 PM")).toBeInTheDocument()
    expect(within(container).getByText("Now")).toBeInTheDocument()

    const day = dayWith([flight, palace, tea])
    rerender(
      <DayTimeline trip={makeTrip({ days: [day] })} day={day} activeId={null} hotId={null} onSelect={() => {}} onHover={() => {}} now="03:00" />,
    )
    expect(screen.queryByText("Now")).toBeNull()
  })

  it("explains the timeline when nothing has a time yet", () => {
    renderTimeline([bar])
    expect(screen.getByText("Stops with a start time appear on the timeline; the rest wait under Anytime.")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: /on the clock/ })).toBeNull()
    expect(stopNamed("Anytime, Sunset bar, stop 1")).toBeInTheDocument()
  })

  it("says so when the day is empty", () => {
    renderTimeline([])
    expect(screen.getByText("Nothing on the clock yet. Stops with a start time appear on the timeline.")).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toEqual([])
  })

  it("labels the region with the day's number", () => {
    renderTimeline()
    expect(screen.getByRole("region", { name: "Day 1 timeline" })).toBeInTheDocument()
  })
})
