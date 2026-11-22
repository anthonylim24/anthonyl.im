import { describe, expect, it, vi } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { TripDay } from "../types"
import { DayPanel } from "../workspace/DayPanel"
import { makeItem, makeTrip } from "./tripFixtures"

const day: TripDay = {
  id: "day-1",
  date: "2030-07-10",
  items: [
    makeItem({ id: "it-a", title: "Temple" }),
    makeItem({ id: "it-b", title: "Lunch" }),
    makeItem({ id: "it-c", title: "Garden" }),
  ],
}

function renderDay(onChange = vi.fn()) {
  const trip = makeTrip({ days: [day] })
  const noop = vi.fn()
  render(
    <MemoryRouter>
      <DayPanel
        trip={trip}
        day={day}
        dayIndex={0}
        basePath="/trips/lisbon"
        editable
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
        onChange={onChange}
        onDelete={noop}
        onAdded={noop}
        onHover={noop}
        onLocate={noop}
        onAskAi={noop}
        onClear={noop}
        onApplyRun={noop}
        onDismissRun={noop}
        onStopAi={noop}
        sky={{ status: "none" }}
      />
    </MemoryRouter>,
  )
  return onChange
}

/** The day after the last change the panel asked for. */
const applied = (onChange: ReturnType<typeof vi.fn>) => {
  const change = onChange.mock.calls.at(-1)?.[0] as (days: TripDay[]) => TripDay[]
  return change([day])[0]!.items.map((item) => item.id)
}

// Dragging and Motion's Space-to-grab need measured layouts, which happy-dom
// does not have: those are checked in a real browser.
describe("DayPanel reordering", () => {
  it("lists the stops as rows Motion can reorder, by id", () => {
    renderDay()
    const rows = [...document.querySelectorAll("ol > li")].map((li) => li.querySelector("[id^='item-']")?.id)
    expect(rows).toEqual(["item-it-a", "item-it-b", "item-it-c"])
  })

  it("moves a stop with Alt and an arrow on its card", () => {
    const onChange = renderDay()
    const head = document.getElementById("item-it-b")!.querySelector<HTMLElement>("[data-card-row]")!
    fireEvent.keyDown(head, { key: "ArrowUp", altKey: true })
    expect(applied(onChange)).toEqual(["it-b", "it-a", "it-c"])
  })
})
