import { describe, expect, it } from "vitest"
import { copyItemToDays, duplicateItem, moveItemToDay, removeItem } from "../tripEdits"
import { sortByTime } from "../workspace/dayOps"
import { undoFocus } from "../workspace/undoFocus"
import type { TripDay } from "../types"
import { makeItem } from "./tripFixtures"

const days: TripDay[] = [
  { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "castle", title: "Castle", time: "15:00" }), makeItem({ id: "lunch", title: "Lunch", time: "12:30" }), makeItem({ id: "tram", title: "Tram 28" })] },
  { id: "day-2", date: "2026-07-11", items: [makeItem({ id: "belem", title: "Belém" })] },
]
const undoing = (after: TripDay[]) => undoFocus({ before: { days }, after: { days: after } })

describe("undoFocus", () => {
  it("hands an undone duplicate's focus to its original", () => {
    expect(undoing(duplicateItem(days, "day-1", "lunch"))[0]).toBe("lunch")
  })

  it("hands an undone delete's focus to the stop it brings back", () => {
    expect(undoing(removeItem(days, "day-1", "lunch"))).toEqual(["lunch"])
  })

  it("hands an undone move to another day's focus to the stop, back on its day", () => {
    expect(undoing(moveItemToDay(days, "day-1", "tram", "day-2"))).toEqual(["tram"])
  })

  it("hands an undone clear's focus to the day's first stop", () => {
    expect(undoing(days.map((day) => (day.id === "day-1" ? { ...day, items: [] } : day)))[0]).toBe("castle")
  })

  it("offers the stops beside copies on other days, and nothing for a reorder", () => {
    expect(undoing(copyItemToDays(days, "day-1", "lunch", ["day-2"]))).toEqual(["belem"])
    expect(undoing(days.map((day) => ({ ...day, items: sortByTime(day.items) })))).toEqual([])
  })
})
