import { describe, expect, it } from "vitest"
import type { ConciergeProposal } from "../../../lib/conciergeGrounding"
import { applyLabel, applyProposal, dayShort, describeChange, insertByTime, proposalDay, restoreSnapshot, snapshotDays } from "../conciergeProposal"
import { settleStreamingMarkdown } from "../streamingText"
import type { ItineraryItem, TripDay } from "../types"

const stop = (id: string, time?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: id,
  status: "none",
  createdBy: "user",
  ...(time ? { time } : {}),
  ...extra,
})

const days = (): TripDay[] => [
  { id: "fri", date: "2026-11-13", items: [stop("pastry", "09:30"), stop("museum", "15:00", { endTime: "16:30" }), stop("dinner", "20:30")] },
  { id: "sat", date: "2026-11-14", items: [] },
]

const order = (list: TripDay[], id: string) => list.find((d) => d.id === id)!.items.map((i) => `${i.time ?? "--"} ${i.title}`)

describe("applyProposal", () => {
  const proposal: ConciergeProposal = {
    id: "p",
    summary: "Rework the weekend",
    changes: [
      { id: "c1", op: "add", dayId: "fri", time: "12:30", notes: "Order the clams.", place: { name: "Lunch Spot", lat: 1, lng: 2, ref: "r1" } },
      { id: "c2", op: "set_time", dayId: "fri", itemId: "dinner", title: "dinner", from: "20:30", time: "14:00" },
      { id: "c3", op: "move", itemId: "museum", title: "museum", fromDayId: "fri", toDayId: "sat", time: "17:00" },
      { id: "c4", op: "remove", dayId: "fri", itemId: "pastry", title: "pastry" },
      { id: "c5", op: "remove", dayId: "fri", itemId: "ghost", title: "Ghost" },
    ],
  }

  it("applies a batch in order, keeping each day in clock order", () => {
    const result = applyProposal(days(), proposal)
    expect(order(result.days, "fri")).toEqual(["12:30 Lunch Spot", "14:00 dinner"])
    // The old 16:30 end would now be before the start, so it is dropped.
    expect(result.days[1]!.items[0]).toMatchObject({ id: "museum", time: "17:00" })
    expect(result.days[1]!.items[0]!.endTime).toBeUndefined()
    expect(result.applied).toEqual(["c1", "c2", "c3", "c4"])
    expect(result.skipped).toEqual([{ id: "c5", reason: "Ghost is already gone." }])
    expect(result.touched.sort()).toEqual(["fri", "sat"])
    const added = result.days[0]!.items[0]!
    expect(added).toMatchObject({ notes: "Order the clams.", createdBy: "ai", location: { name: "Lunch Spot", source: "ai" } })
    expect(result.added.c1).toEqual({ dayId: "fri", itemId: added.id })
  })

  it("applies only what was ticked, and undo puts the days back", () => {
    const before = days()
    const result = applyProposal(before, proposal, new Set(["c4"]))
    expect(order(result.days, "fri")).toEqual(["15:00 museum", "20:30 dinner"])
    expect(result.applied).toEqual(["c4"])
    const snapshot = snapshotDays(before, result.touched)
    expect(restoreSnapshot(result.days, snapshot)).toEqual(before)
  })

  it("does not add a place twice, and leaves a hand-ordered day's order alone", () => {
    const twice = applyProposal(applyProposal(days(), proposal, new Set(["c1"])).days, proposal, new Set(["c1"]))
    expect(twice.applied).toEqual([])
    expect(twice.skipped[0]!.reason).toContain("already on that day")

    const jumbled: TripDay[] = [{ id: "fri", date: "2026-11-13", items: [stop("late", "21:00"), stop("early", "08:00"), stop("mid", "12:00")] }]
    const retimed = applyProposal(jumbled, { id: "p", summary: "s", changes: [{ id: "c", op: "set_time", dayId: "fri", itemId: "mid", title: "mid", time: "07:00" }] })
    expect(order(retimed.days, "fri")).toEqual(["21:00 late", "08:00 early", "07:00 mid"])
  })

  it("reorders a day and keeps stops the proposal did not know about", () => {
    const result = applyProposal(days(), { id: "p", summary: "s", changes: [{ id: "c", op: "reorder", dayId: "fri", order: ["dinner", "pastry"], titles: [] }] })
    expect(result.days[0]!.items.map((i) => i.id)).toEqual(["dinner", "pastry", "museum"])
  })
})

describe("proposal copy", () => {
  it("describes each change in a line and labels the button", () => {
    const list = days()
    expect(describeChange({ id: "c", op: "set_time", dayId: "fri", itemId: "dinner", title: "Dinner", from: "20:30", time: "20:00" }, list)).toEqual({
      op: "set_time",
      lead: "20:00",
      title: "Dinner",
      detail: "Fri 13 Nov · was 20:30",
    })
    expect(describeChange({ id: "c", op: "move", itemId: "museum", title: "Museum", fromDayId: "fri", toDayId: "sat" }, list).detail).toBe("Fri 13 Nov → Sat 14 Nov")
    // A one-day batch names the day in the heading, not on every row.
    expect(describeChange({ id: "c", op: "remove", dayId: "fri", itemId: "x", title: "X" }, list, "fri").detail).toBe("")
    expect(proposalDay({ id: "p", summary: "s", changes: [{ id: "c", op: "remove", dayId: "fri", itemId: "x", title: "X" }] }, list)?.id).toBe("fri")
    expect(dayShort({ date: "2026-11-14" })).toBe("Sat 14 Nov")
    const one: ConciergeProposal = { id: "p", summary: "s", changes: [{ id: "c", op: "remove", dayId: "fri", itemId: "x", title: "X" }] }
    expect(applyLabel(one, 1)).toBe("Remove it")
    const many: ConciergeProposal = { ...one, changes: [...one.changes, { ...one.changes[0]!, id: "d" }] }
    expect(applyLabel(many, 2)).toBe("Apply all 2")
    expect(applyLabel(many, 1)).toBe("Apply 1 of 2")
  })

  it("inserts by time, or at the end when the day has no times", () => {
    expect(insertByTime([stop("a", "09:00"), stop("b", "13:00")], stop("new", "11:00")).map((i) => i.id)).toEqual(["a", "new", "b"])
    expect(insertByTime([stop("a"), stop("b")], stop("new", "11:00")).map((i) => i.id)).toEqual(["a", "b", "new"])
  })
})

describe("settleStreamingMarkdown", () => {
  it("hides half-finished syntax while the reply streams", () => {
    expect(settleStreamingMarkdown("Go to **Bloc")).toBe("Go to **Bloc**")
    expect(settleStreamingMarkdown("Go to **Bloco** then **")).toBe("Go to **Bloco** then ")
    expect(settleStreamingMarkdown("See [the site](https://exa")).toBe("See the site")
    expect(settleStreamingMarkdown("One.\n- ")).toBe("One.")
    expect(settleStreamingMarkdown("* **Bus 728**: walk")).toBe("* **Bus 728**: walk")
    expect(settleStreamingMarkdown("Say *sou cel")).toBe("Say *sou cel*")
    expect(settleStreamingMarkdown("Plain text.")).toBe("Plain text.")
  })
})
