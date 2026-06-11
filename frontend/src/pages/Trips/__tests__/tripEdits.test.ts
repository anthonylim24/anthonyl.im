import { describe, expect, it } from "vitest"
import {
  addItem,
  convertNoteToPlace,
  duplicateItem,
  makeItem,
  moveItem,
  moveItemToDay,
  removeItem,
  updateItem,
} from "../tripEdits"
import type { TripDay } from "../types"

function makeDays(): TripDay[] {
  return [
    {
      id: "day-1",
      date: "2026-07-10",
      items: [
        { id: "a", kind: "place", title: "Temple", status: "none", createdBy: "user" },
        { id: "b", kind: "note", title: "Buy Suica", status: "none", createdBy: "user" },
      ],
    },
    { id: "day-2", date: "2026-07-11", items: [] },
  ]
}

describe("tripEdits", () => {
  it("adds an item at the end by default", () => {
    const next = addItem(makeDays(), "day-1", makeItem("note", "New"))
    expect(next[0]!.items.map((i) => i.title)).toEqual(["Temple", "Buy Suica", "New"])
  })

  it("updates an item without touching others", () => {
    const days = makeDays()
    const next = updateItem(days, "day-1", "a", { title: "Senso-ji", status: "booked" })
    expect(next[0]!.items[0]).toMatchObject({ title: "Senso-ji", status: "booked" })
    expect(next[0]!.items[1]).toBe(days[0]!.items[1]!)
  })

  it("removes an item", () => {
    const next = removeItem(makeDays(), "day-1", "a")
    expect(next[0]!.items.map((i) => i.id)).toEqual(["b"])
  })

  it("moves items within a day and no-ops at edges", () => {
    const days = makeDays()
    expect(moveItem(days, "day-1", "a", 1)[0]!.items.map((i) => i.id)).toEqual(["b", "a"])
    expect(moveItem(days, "day-1", "a", -1)[0]!.items.map((i) => i.id)).toEqual(["a", "b"])
  })

  it("moves an item to another day", () => {
    const next = moveItemToDay(makeDays(), "day-1", "b", "day-2")
    expect(next[0]!.items.map((i) => i.id)).toEqual(["a"])
    expect(next[1]!.items.map((i) => i.id)).toEqual(["b"])
  })

  it("duplicates an item with a fresh id directly below the original", () => {
    const next = duplicateItem(makeDays(), "day-1", "a")
    expect(next[0]!.items.length).toBe(3)
    expect(next[0]!.items[1]!.title).toBe("Temple")
    expect(next[0]!.items[1]!.id).not.toBe("a")
  })

  it("converts a note into a place with a seeded location", () => {
    const next = convertNoteToPlace(makeDays(), "day-1", "b")
    const converted = next[0]!.items[1]!
    expect(converted.kind).toBe("place")
    expect(converted.location).toEqual({ name: "Buy Suica", source: "user" })
  })

  it("does not mutate the input", () => {
    const days = makeDays()
    const snapshot = JSON.stringify(days)
    addItem(days, "day-1", makeItem("note"))
    moveItem(days, "day-1", "a", 1)
    removeItem(days, "day-1", "a")
    expect(JSON.stringify(days)).toBe(snapshot)
  })
})
