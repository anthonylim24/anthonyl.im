import { describe, expect, it } from "vitest"
import { mergeDays, mergeItems, rebaseTrip, sameJson } from "../tripMerge"
import type { ItineraryItem, TripDay } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

const item = (id: string, title = id, extra: Partial<ItineraryItem> = {}) => makeItem({ id, title, ...extra })
const ids = (items: readonly ItineraryItem[]) => items.map((i) => i.id)
const day = (id: string, items: ItineraryItem[], extra: Partial<TripDay> = {}): TripDay => ({ id, date: `2026-07-1${id.slice(-1)}`, items, ...extra })

describe("sameJson", () => {
  it("ignores key order and undefined properties", () => {
    expect(sameJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  })

  it("tells real differences apart", () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson([], {})).toBe(false)
    expect(sameJson(null, {})).toBe(false)
  })
})

describe("mergeItems", () => {
  const a = item("a")
  const b = item("b")
  const c = item("c")
  const base = [a, b, c]

  it("keeps items each side added, in the place each side put them", () => {
    const mine = [a, item("m"), b, c]
    const theirs = [a, b, c, item("t")]
    expect(ids(mergeItems(base, mine, theirs))).toEqual(["a", "m", "b", "c", "t"])
  })

  it("lets the traveller's edit to an item win, and takes theirs where the traveller left it alone", () => {
    const mine = [item("a", "A mine"), b, c]
    const theirs = [item("a", "A theirs"), item("b", "B theirs"), c]
    expect(mergeItems(base, mine, theirs).map((i) => i.title)).toEqual(["A mine", "B theirs", "c"])
  })

  it("drops what they deleted unless the traveller edited it", () => {
    expect(ids(mergeItems(base, [a, b, c], [a, c]))).toEqual(["a", "c"])
    expect(mergeItems(base, [a, item("b", "B edited"), c], [a, c]).map((i) => i.title)).toEqual(["a", "B edited", "c"])
  })

  it("keeps the traveller's deletions, even of something they changed", () => {
    expect(ids(mergeItems(base, [a, c], [a, item("b", "B theirs"), c]))).toEqual(["a", "c"])
  })

  it("keeps the traveller's order when they reordered, with their new items slotted in", () => {
    const mine = [c, a, b]
    const theirs = [a, item("t"), b, c]
    expect(ids(mergeItems(base, mine, theirs))).toEqual(["c", "a", "t", "b"])
  })

  it("takes their order when only they reordered", () => {
    expect(ids(mergeItems(base, [a, item("b", "B"), c, item("m")], [c, b, a]))).toEqual(["c", "m", "b", "a"])
  })

  it("puts a new item that leads its list at the front", () => {
    expect(ids(mergeItems(base, [item("m"), a, b, c], base))).toEqual(["m", "a", "b", "c"])
  })
})

describe("mergeDays", () => {
  const d1 = day("d1", [item("a")])
  const d2 = day("d2", [item("b")])
  const base = [d1, d2]

  it("takes each side's version of the days only it touched", () => {
    const mine = [day("d1", [item("a", "A mine")]), d2]
    const theirs = [d1, day("d2", [item("b"), item("t")])]
    const merged = mergeDays(base, mine, theirs)!
    expect(merged[0]!.items[0]!.title).toBe("A mine")
    expect(ids(merged[1]!.items)).toEqual(["b", "t"])
  })

  it("merges a day both sides changed, field by field", () => {
    const mine = [day("d1", [item("a"), item("m")], { title: "Arrival" }), d2]
    const theirs = [day("d1", [item("a"), item("t")], { city: "Lisbon" }), d2]
    const merged = mergeDays(base, mine, theirs)!
    expect(merged[0]).toMatchObject({ title: "Arrival", city: "Lisbon" })
    expect(ids(merged[0]!.items)).toEqual(["a", "m", "t"])
  })

  it("is a conflict when both sides renamed the same day differently", () => {
    const mine = [day("d1", [item("a"), item("m")], { title: "Mine" }), d2]
    const theirs = [day("d1", [item("a")], { title: "Theirs" }), d2]
    expect(mergeDays(base, mine, theirs)).toBeNull()
  })

  it("follows a change to the list of days made on one side", () => {
    const d3 = day("d3", [])
    expect(mergeDays(base, [d1, d2, d3], [d1, day("d2", [item("b"), item("t")])])!.map((d) => d.id)).toEqual(["d1", "d2", "d3"])
    expect(mergeDays(base, [day("d1", [item("a", "A")]), d2], [d1])!.map((d) => d.id)).toEqual(["d1"])
  })

  it("is a conflict when a day one side dropped was changed by the other", () => {
    expect(mergeDays(base, [d1], [d1, day("d2", [item("b"), item("t")])])).toBeNull()
    expect(mergeDays(base, [d1, day("d2", [item("b", "B")])], [d1])).toBeNull()
  })

  it("is a conflict when both sides changed the list of days differently", () => {
    expect(mergeDays(base, [d1], [d1, d2, day("d3", [])])).toBeNull()
  })
})

describe("rebaseTrip", () => {
  const base = makeTrip({ updatedAt: "2026-01-01T00:00:00Z" })

  it("carries the traveller's changes onto their newer copy", () => {
    const mine = { ...base, name: "Mine", days: [day("day-1", [item("m")]), base.days[1]!] }
    const theirs = { ...base, updatedAt: "2026-01-02T00:00:00Z", description: "Theirs", days: [base.days[0]!, day("day-2", [item("t")])] }
    const out = rebaseTrip(base, mine, theirs)!
    expect(out).toMatchObject({ name: "Mine", description: "Theirs", updatedAt: "2026-01-02T00:00:00Z" })
    expect(out.days.map((d) => ids(d.items))).toEqual([["m"], ["t"]])
  })

  it("keeps server-owned fields from their copy", () => {
    const theirs = { ...base, updatedAt: "2026-01-02T00:00:00Z", collaborators: [{ userId: "u2", role: "editor" as const }] }
    expect(rebaseTrip(base, { ...base, name: "Mine" }, theirs)!.collaborators).toEqual(theirs.collaborators)
  })

  it("is a conflict when both renamed the trip differently", () => {
    expect(rebaseTrip(base, { ...base, name: "Mine" }, { ...base, name: "Theirs" })).toBeNull()
  })
})
