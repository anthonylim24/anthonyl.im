import { describe, expect, it } from "vitest"
import { mergeDays, mergeItems, rebaseTrip, resolveTrip, sameJson } from "../tripMerge"
import type { ItineraryItem, Trip, TripDay } from "../types"
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

describe("rebaseTrip: budget and the trip's lists", () => {
  const base = makeTrip({ updatedAt: "2026-01-01T00:00:00Z" })
  const expense = (id: string, title = id) => ({ id, title, amount: 10, currency: "EUR", category: "food" as const, createdAt: "2026-01-01T00:00:00Z" })
  const task = (id: string, done = false) => ({ id, text: id, done, group: "packing" as const, createdAt: "2026-01-01T00:00:00Z" })

  it("keeps expenses both sides added at the same time", () => {
    const mine = { ...base, expenses: [expense("m")] }
    const theirs = { ...base, updatedAt: "2026-01-02T00:00:00Z", expenses: [expense("t")] }
    expect(rebaseTrip(base, mine, theirs)!.expenses!.map((e) => e.id).sort()).toEqual(["m", "t"])
  })

  it("merges checklist ticks entry by entry, the traveller's edit winning", () => {
    const start = { ...base, checklist: [task("a"), task("b")] }
    const mine = { ...start, checklist: [task("a", true), task("b")] }
    const theirs = { ...start, updatedAt: "2026-01-02T00:00:00Z", checklist: [task("a"), task("b", true), task("c")] }
    const out = rebaseTrip(start, mine, theirs)!
    expect(out.checklist).toEqual([task("a", true), task("b", true), task("c")])
  })

  it("takes their list when the traveller left it alone", () => {
    const theirs = { ...base, updatedAt: "2026-01-02T00:00:00Z", party: [{ id: "p1", name: "Sam" }] }
    expect(rebaseTrip(base, { ...base, name: "Mine" }, theirs)!.party).toEqual([{ id: "p1", name: "Sam" }])
  })

  it("is a conflict when both set a different budget", () => {
    const mine = { ...base, budget: { currency: "EUR", total: 100 } }
    const theirs = { ...base, budget: { currency: "EUR", total: 200 } }
    expect(rebaseTrip(base, mine, theirs)).toBeNull()
  })
})

describe("a wishlist idea someone else scheduled", () => {
  // An AI review the traveller stopped following still finishes on the
  // server: it puts the idea on day 2 (same id) and takes it off the wishlist.
  const idea = item("idea-1", "Pasteis de Belem", { notes: "Eat them warm" })
  const base = makeTrip({ ideas: [idea, item("idea-2")] })
  const scheduled = { ...idea, time: "09:30", status: "needs_review" as const, createdBy: "ai" as const }
  const theirs = {
    ...base,
    updatedAt: "2026-01-02T00:00:00Z",
    ideas: [item("idea-2")],
    days: [base.days[0]!, { ...base.days[1]!, items: [scheduled] }],
  }

  it("stays off the wishlist when the traveller edited it meanwhile, and the edit moves to the stop", () => {
    const mine = { ...base, ideas: [{ ...idea, title: "Pastéis de Belém", notes: "Take a box home" }, item("idea-2")] }
    for (const out of [rebaseTrip(base, mine, theirs)!, resolveTrip(base, mine, theirs, "mine"), resolveTrip(base, mine, theirs, "theirs")]) {
      expect(ids(out.ideas!)).toEqual(["idea-2"])
      const stop = out.days[1]!.items[0]!
      expect(stop.id).toBe("idea-1")
      expect(stop.time).toBe("09:30")
    }
    const out = rebaseTrip(base, mine, theirs)!
    expect(out.days[1]!.items[0]).toMatchObject({ title: "Pastéis de Belém", notes: "Take a box home", time: "09:30", status: "needs_review" })
  })

  it("a field the traveller cleared on the idea is cleared on the stop", () => {
    const mine = { ...base, ideas: [{ ...idea, notes: undefined }, item("idea-2")] }
    const out = rebaseTrip(base, mine, theirs)!
    expect(out.days[1]!.items[0]!.notes).toBeUndefined()
  })

  it("an idea the traveller left alone goes as before", () => {
    const mine = { ...base, name: "Renamed" }
    const out = rebaseTrip(base, mine, theirs)!
    expect(ids(out.ideas!)).toEqual(["idea-2"])
    expect(out.days[1]!.items[0]).toEqual(scheduled)
  })

  it("saving a stop for later that someone else edited keeps it in one place only", () => {
    const stop = item("s1", "Time Out Market")
    const start = makeTrip({ days: [{ ...makeTrip().days[0]!, items: [stop] }, makeTrip().days[1]!] })
    const mine = { ...start, days: [{ ...start.days[0]!, items: [] }, start.days[1]!], ideas: [stop] }
    const edited = { ...start, updatedAt: "2026-01-02T00:00:00Z", days: [{ ...start.days[0]!, items: [{ ...stop, notes: "Go at 11" }] }, start.days[1]!] }
    for (const out of [rebaseTrip(start, mine, edited)!, resolveTrip(start, mine, edited, "theirs")]) {
      const onDays = out.days.flatMap((d) => d.items).filter((i) => i.id === "s1").length
      const onWishlist = (out.ideas ?? []).filter((i) => i.id === "s1").length
      expect(onDays + onWishlist).toBe(1)
    }
  })
})

describe("mergeItems with a side", () => {
  const a = item("a")
  const b = item("b")
  const base = [a, b]

  it("gives an item both sides edited to that side", () => {
    const mine = [item("a", "A mine"), b]
    const theirs = [item("a", "A theirs"), b]
    expect(mergeItems(base, mine, theirs, "mine")[0]!.title).toBe("A mine")
    expect(mergeItems(base, mine, theirs, "theirs")[0]!.title).toBe("A theirs")
  })

  it("settles a delete against an edit by side", () => {
    // They deleted b, the traveller edited it.
    expect(ids(mergeItems(base, [a, item("b", "B mine")], [a], "mine"))).toEqual(["a", "b"])
    expect(ids(mergeItems(base, [a, item("b", "B mine")], [a], "theirs"))).toEqual(["a"])
    // The traveller deleted b, they edited it.
    expect(ids(mergeItems(base, [a], [a, item("b", "B theirs")], "mine"))).toEqual(["a"])
    expect(mergeItems(base, [a], [a, item("b", "B theirs")], "theirs").map((i) => i.title)).toEqual(["a", "B theirs"])
  })

  it("follows the winning side's order when both reordered", () => {
    const c = item("c")
    const start = [a, b, c]
    expect(ids(mergeItems(start, [c, a, b], [b, a, c], "theirs"))).toEqual(["b", "a", "c"])
    expect(ids(mergeItems(start, [c, a, b], [b, a, c], "mine"))).toEqual(["c", "a", "b"])
  })
})

describe("resolveTrip", () => {
  const T0 = "2026-01-01T00:00:00Z"
  const T1 = "2026-01-02T00:00:00Z"
  const fiveDays = (): Trip =>
    makeTrip({
      updatedAt: T0,
      startDate: "2026-07-11",
      endDate: "2026-07-15",
      days: [1, 2, 3, 4, 5].map((n) => day(`d${n}`, [item(`s${n}`)], { title: `Day ${n}` })),
    })
  const withDay = (trip: Trip, n: number, change: (d: TripDay) => TripDay): Trip => ({
    ...trip,
    days: trip.days.map((d) => (d.id === `d${n}` ? change(d) : d)),
  })

  it("keeps their stop on day 5 when both renamed day 3, whichever side wins the title", () => {
    const base = fiveDays()
    const mine = withDay(base, 3, (d) => ({ ...d, title: "Mine" }))
    const theirs = withDay(withDay({ ...base, updatedAt: T1 }, 3, (d) => ({ ...d, title: "Theirs" })), 5, (d) => ({
      ...d,
      items: [...d.items, item("t5", "Their stop")],
    }))
    expect(rebaseTrip(base, mine, theirs)).toBeNull()

    const kept = resolveTrip(base, mine, theirs, "mine")
    expect(kept.days[2]!.title).toBe("Mine")
    expect(ids(kept.days[4]!.items)).toEqual(["s5", "t5"])
    expect(kept.updatedAt).toBe(T1)

    const theirsWon = resolveTrip(base, mine, theirs, "theirs")
    expect(theirsWon.days[2]!.title).toBe("Theirs")
    expect(ids(theirsWon.days[4]!.items)).toEqual(["s5", "t5"])
  })

  it("keeps the traveller's edits that clash with nothing when they use theirs", () => {
    const base = fiveDays()
    const mine = withDay({ ...base, name: "My name" }, 1, (d) => ({ ...d, items: [...d.items, item("m1", "My stop")] }))
    const theirs = { ...base, updatedAt: T1, name: "Their name" }
    const out = resolveTrip(base, mine, theirs, "theirs")
    expect(out.name).toBe("Their name")
    expect(ids(out.days[0]!.items)).toEqual(["s1", "m1"])
  })

  it("settles each clashing trip field and list entry, merging the rest", () => {
    const expense = (id: string, title = id) => ({ id, title, amount: 10, currency: "EUR", category: "food" as const, createdAt: T0 })
    const base = { ...fiveDays(), expenses: [expense("e1")] }
    const mine = { ...base, name: "Mine", budget: { currency: "EUR", total: 100 }, expenses: [expense("e1", "Lunch")] }
    const theirs = { ...base, updatedAt: T1, name: "Theirs", description: "Theirs", expenses: [expense("e1", "Dinner"), expense("e2")] }
    const mineWins = resolveTrip(base, mine, theirs, "mine")
    expect(mineWins).toMatchObject({ name: "Mine", description: "Theirs", budget: { currency: "EUR", total: 100 } })
    expect(mineWins.expenses!.map((e) => e.title)).toEqual(["Lunch", "e2"])
    const theirsWin = resolveTrip(base, mine, theirs, "theirs")
    expect(theirsWin).toMatchObject({ name: "Theirs", description: "Theirs", budget: { currency: "EUR", total: 100 } })
    expect(theirsWin.expenses!.map((e) => e.title)).toEqual(["Dinner", "e2"])
  })

  it("takes the chosen side's days and dates together when both changed the list of days", () => {
    const base = fiveDays()
    // The traveller cut the trip to four days; they added a sixth.
    const mine = { ...base, endDate: "2026-07-14", days: base.days.slice(0, 4) }
    const theirs = { ...base, updatedAt: T1, endDate: "2026-07-16", days: [...base.days, day("d6", [item("t6")])] }
    expect(rebaseTrip(base, mine, theirs)).toBeNull()

    const kept = resolveTrip(base, mine, theirs, "mine")
    expect(kept.days.map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4"])
    expect(kept.endDate).toBe("2026-07-14")

    const theirsWon = resolveTrip(base, mine, theirs, "theirs")
    expect(theirsWon.days.map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4", "d5", "d6"])
    expect(theirsWon.endDate).toBe("2026-07-16")
  })

  it("settles a day one side dropped while the other changed it", () => {
    const base = fiveDays()
    const mine = withDay(base, 5, (d) => ({ ...d, notes: "Late checkout" }))
    const theirs = { ...base, updatedAt: T1, endDate: "2026-07-14", days: base.days.slice(0, 4) }
    expect(rebaseTrip(base, mine, theirs)).toBeNull()
    const kept = resolveTrip(base, mine, theirs, "mine")
    expect(kept.days.map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4", "d5"])
    expect(kept.days[4]!.notes).toBe("Late checkout")
    expect(kept.endDate).toBe("2026-07-15")
    const theirsWon = resolveTrip(base, mine, theirs, "theirs")
    expect(theirsWon.days).toHaveLength(4)
    expect(theirsWon.endDate).toBe("2026-07-14")
  })

  it("merges every day field, including ones added after this code was written", () => {
    const base = fiveDays()
    const mine = withDay(base, 2, (d) => ({ ...d, emoji: "🌊", title: "Mine" }))
    const theirs = withDay({ ...base, updatedAt: T1 }, 2, (d) => ({ ...d, neighborhoods: ["Alfama"], title: "Theirs" }))
    expect(resolveTrip(base, mine, theirs, "theirs").days[1]).toMatchObject({ emoji: "🌊", neighborhoods: ["Alfama"], title: "Theirs" })
  })
})
