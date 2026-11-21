import { describe, expect, it, vi } from "vitest"
import { makeItem, makeSummary, makeTrip } from "../../__tests__/tripFixtures"
import type { Trip } from "../../types"
import type { Command } from "../commands"
import { tripCommands, tripListCommands } from "../tripCommands"

function trip(): Trip {
  return makeTrip({
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        title: "Alfama and the castle",
        city: "Lisbon",
        items: [
          makeItem({ id: "it-1", title: "Castelo de São Jorge", time: "10:00", location: { name: "Castelo de São Jorge", category: "landmark", source: "user" } }),
          makeItem({ id: "it-2", kind: "section", title: "Evening" }),
          makeItem({ id: "it-3", kind: "note", title: "  " }),
          makeItem({
            id: "it 4",
            kind: "reservation",
            title: "Dinner at Taberna",
            reservation: { type: "meal", status: "confirmed", confirmation: "QX7Z" },
          }),
        ],
      },
      { id: "day-2", date: "2026-07-11", items: [] },
    ],
  })
}

const byId = (commands: Command[], id: string) => {
  const command = commands.find((c) => c.id === id)
  if (!command) throw new Error(`no command ${id}`)
  return command
}

describe("tripCommands", () => {
  it("builds a row per day that opens it", () => {
    const navigate = vi.fn()
    const commands = tripCommands({ trip: trip(), basePath: "/trips/lisbon", navigate })
    const days = commands.filter((c) => c.group === "Days")
    expect(days.map((c) => [c.title, c.subtitle])).toEqual([
      ["Day 1 · Fri Jul 10 · Alfama and the castle", "Lisbon · 3 stops"],
      ["Day 2 · Sat Jul 11", "0 stops"],
    ])
    expect(days[0]!.keywords).toContain("go to day 1")
    days[1]!.run()
    expect(navigate).toHaveBeenCalledWith("/trips/lisbon/day/day-2")
  })

  it("builds a row per titled stop that opens its day at the stop", () => {
    const navigate = vi.fn()
    const stops = tripCommands({ trip: trip(), basePath: "/trips/lisbon", navigate }).filter((c) => c.group === "Stops")
    // Sections are headings and an untitled note has nothing to find it by.
    expect(stops.map((c) => [c.title, c.subtitle])).toEqual([
      ["Castelo de São Jorge", "Day 1 · 10:00"],
      ["Dinner at Taberna", "Day 1"],
    ])
    expect(stops[1]!.keywords).toEqual(["meal", "QX7Z", "Lisbon"])
    stops[0]!.run()
    expect(navigate).toHaveBeenLastCalledWith("/trips/lisbon/day/day-1#item-it-1")
    stops[1]!.run()
    expect(navigate).toHaveBeenLastCalledWith("/trips/lisbon/day/day-1#item-it%204")
  })

  it("offers only the actions it was given, in order", () => {
    const share = vi.fn()
    const openTab = vi.fn()
    const commands = tripCommands({
      trip: trip(),
      basePath: "/trips/lisbon",
      navigate: vi.fn(),
      actions: { share, improve: vi.fn(), exportCalendar: vi.fn(), copyText: vi.fn(), openTab },
    })
    expect(commands.filter((c) => c.group === "Actions").map((c) => c.title)).toEqual([
      "Share trip",
      "Improve with AI",
      "Export to calendar",
      "Copy itinerary as text",
    ])
    byId(commands, "trip:share").run()
    expect(share).toHaveBeenCalledTimes(1)
    byId(commands, "trip:tab-budget").run()
    expect(openTab).toHaveBeenCalledWith("budget")
    expect(commands.filter((c) => c.group === "Go to").map((c) => c.title)).toEqual(["Itinerary", "Budget", "Checklist", "Essentials"])
  })

  it("turns off what cannot run: nothing to export, or the editor held by AI", () => {
    const empty = makeTrip()
    const commands = tripCommands({
      trip: empty,
      basePath: "/trips/lisbon",
      navigate: vi.fn(),
      locked: true,
      actions: { exportCalendar: vi.fn(), improve: vi.fn(), details: vi.fn(), share: vi.fn() },
    })
    expect(byId(commands, "trip:calendar").disabled).toBe(true)
    expect(byId(commands, "trip:improve")).toMatchObject({ title: "Draft with AI", disabled: true })
    expect(byId(commands, "trip:details").disabled).toBe(true)
    expect(byId(commands, "trip:share").disabled).toBeFalsy()
  })

  it("steps between days from a day page", () => {
    const navigate = vi.fn()
    const onDay1 = tripCommands({ trip: trip(), basePath: "/trips/lisbon", navigate, dayId: "day-1" })
    expect(onDay1.filter((c) => c.group === "Go to").map((c) => c.title)).toEqual(["Trip overview", "Next day"])
    byId(onDay1, "trip:next-day").run()
    expect(navigate).toHaveBeenLastCalledWith("/trips/lisbon/day/day-2")
    expect(byId(onDay1, "trip:next-day").shortcut).toEqual(["right"])

    const onDay2 = tripCommands({ trip: trip(), basePath: "/trips/lisbon", navigate, dayId: "day-2" })
    expect(onDay2.filter((c) => c.group === "Go to").map((c) => c.title)).toEqual(["Trip overview", "Previous day"])
    byId(onDay2, "trip:overview").run()
    expect(navigate).toHaveBeenLastCalledWith("/trips/lisbon")

    expect(tripCommands({ trip: trip(), basePath: "/trips/lisbon", navigate }).some((c) => c.group === "Go to")).toBe(false)
  })
})

describe("tripListCommands", () => {
  it("opens each trip by slug, or by id without one", () => {
    const navigate = vi.fn()
    const commands = tripListCommands(
      [makeSummary({ id: "t1", slug: "korea-2026", name: "Korea", destinations: ["Seoul", "Busan"] }), makeSummary({ id: "t2", name: "Lisbon" })],
      navigate,
    )
    expect(commands.map((c) => [c.group, c.title, c.subtitle])).toEqual([
      ["Trips", "Korea", "Jul 10 – 11, 2026"],
      ["Trips", "Lisbon", "Jul 10 – 11, 2026"],
    ])
    expect(commands[0]!.keywords).toEqual(["Seoul", "Busan"])
    commands[0]!.run()
    commands[1]!.run()
    expect(navigate.mock.calls).toEqual([["/trips/korea-2026"], ["/trips/t2"]])
  })
})
