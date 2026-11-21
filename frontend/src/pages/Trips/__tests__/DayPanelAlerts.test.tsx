import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { DayForecast } from "../forecast"
import type { TripDay } from "../types"
import { DayPanel, type DayPanelProps } from "../workspace/DayPanel"
import { makeItem, makeTrip } from "./tripFixtures"

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

function renderDay(day: TripDay, sky: DayPanelProps["sky"]) {
  const trip = makeTrip({ days: [day] })
  const noop = vi.fn()
  return render(
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
        sky={sky}
      />
    </MemoryRouter>,
  )
}

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
