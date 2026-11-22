import type { ConciergeProposal, ProposalChange } from "../../lib/conciergeGrounding"
import { dayHasPlaceNamed, insertByTime, itemFromConciergePlace, removeItem, updateItem } from "./tripEdits"
import type { ItineraryItem, TripDay } from "./types"

export { insertByTime }

// Applying what the concierge proposed. Pure: every function returns new
// arrays, so the caller can diff, save and undo.

// One formatter each, built once: `toLocaleDateString` with options builds a
// new Intl.DateTimeFormat per call, and every place card's day picker asks
// for every day on each render (it was most of the main thread while a
// reply streamed under a long conversation). Built on first use, not on
// import: this module loads with the workspace, and the page's first date
// format costs some 30 ms on a slow phone (`warmDateFormats` in meta.ts).
let short: Intl.DateTimeFormat | null = null
let weekday: Intl.DateTimeFormat | null = null

function formatDate(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? iso : format.format(date)
}

/** "Sat 14 Nov" for a day, from its calendar date (no timezone drift). */
export function dayShort(day: Pick<TripDay, "date">): string {
  short ??= new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  return formatDate(short, day.date)
}

/** "Saturday" for a day. */
export function dayWeekday(day: Pick<TripDay, "date">): string {
  weekday ??= new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" })
  return formatDate(weekday, day.date)
}

export function dayLabel(day: TripDay, index: number): string {
  return day.title?.trim() || `Day ${index + 1}`
}

function withDay(days: TripDay[], dayId: string, fn: (day: TripDay) => TripDay): TripDay[] {
  return days.map((day) => (day.id === dayId ? fn(day) : day))
}

function find(days: TripDay[], itemId: string): { day: TripDay; item: ItineraryItem } | null {
  for (const day of days) {
    const item = day.items.find((i) => i.id === itemId)
    if (item) return { day, item }
  }
  return null
}

export interface ApplyResult {
  days: TripDay[]
  /** Change ids that took effect. */
  applied: string[]
  skipped: Array<{ id: string; reason: string }>
  /** Days whose items changed, for the undo snapshot. */
  touched: string[]
  /** New item ids by change id, so the UI can point at what it added. */
  added: Record<string, { dayId: string; itemId: string }>
}

function applyChange(days: TripDay[], change: ProposalChange, result: ApplyResult): TripDay[] {
  const skip = (reason: string) => {
    result.skipped.push({ id: change.id, reason })
    return days
  }
  const touch = (...ids: string[]) => {
    for (const id of ids) if (!result.touched.includes(id)) result.touched.push(id)
  }

  switch (change.op) {
    case "add": {
      const day = days.find((d) => d.id === change.dayId)
      if (!day) return skip("That day is no longer on the trip.")
      if (dayHasPlaceNamed(day, change.place.name)) return skip(`${change.place.name} is already on that day.`)
      const item: ItineraryItem = {
        ...itemFromConciergePlace({ ...change.place, notes: change.notes ?? change.place.notes }),
        ...(change.time ? { time: change.time } : {}),
        ...(change.endTime ? { endTime: change.endTime } : {}),
      }
      touch(day.id)
      result.added[change.id] = { dayId: day.id, itemId: item.id }
      return withDay(days, day.id, (d) => ({ ...d, items: insertByTime(d.items, item) }))
    }
    case "set_time": {
      const hit = find(days, change.itemId)
      if (!hit) return skip(`${change.title} is no longer on the trip.`)
      const moved: ItineraryItem = { ...hit.item, time: change.time }
      if (change.endTime) moved.endTime = change.endTime
      // An old end time that now falls before the start would be nonsense.
      else if (moved.endTime && moved.endTime <= change.time) delete moved.endTime
      touch(hit.day.id)
      const rest = hit.day.items.filter((i) => i.id !== moved.id)
      const inOrder = rest.every((item, i) => i === 0 || !item.time || !rest[i - 1]!.time || rest[i - 1]!.time! <= item.time)
      // Keep the day in clock order when it already was; otherwise the
      // traveller ordered it by hand, so only the time changes.
      return inOrder
        ? withDay(days, hit.day.id, (d) => ({ ...d, items: insertByTime(rest, moved) }))
        : updateItem(days, hit.day.id, moved.id, { time: moved.time, endTime: moved.endTime })
    }
    case "move": {
      const hit = find(days, change.itemId)
      if (!hit) return skip(`${change.title} is no longer on the trip.`)
      if (!days.some((d) => d.id === change.toDayId)) return skip("That day is no longer on the trip.")
      if (hit.day.id === change.toDayId) return skip(`${change.title} is already on that day.`)
      const moved: ItineraryItem = { ...hit.item, ...(change.time ? { time: change.time } : {}) }
      if (change.time && moved.endTime && moved.endTime <= change.time) delete moved.endTime
      touch(hit.day.id, change.toDayId)
      return withDay(removeItem(days, hit.day.id, moved.id), change.toDayId, (d) => ({ ...d, items: insertByTime(d.items, moved) }))
    }
    case "remove": {
      const hit = find(days, change.itemId)
      if (!hit) return skip(`${change.title} is already gone.`)
      touch(hit.day.id)
      return removeItem(days, hit.day.id, hit.item.id)
    }
    case "reorder": {
      const day = days.find((d) => d.id === change.dayId)
      if (!day) return skip("That day is no longer on the trip.")
      const byId = new Map(day.items.map((item) => [item.id, item]))
      const ordered = change.order.map((id) => byId.get(id)).filter((item): item is ItineraryItem => Boolean(item))
      // Stops added since the proposal keep their place at the end.
      const items = [...ordered, ...day.items.filter((item) => !change.order.includes(item.id))]
      if (items.every((item, i) => item.id === day.items[i]!.id)) return skip("The day is already in that order.")
      touch(day.id)
      return withDay(days, day.id, (d) => ({ ...d, items }))
    }
  }
}

/** Apply the selected changes of a proposal, in order. */
export function applyProposal(days: TripDay[], proposal: ConciergeProposal, selected?: ReadonlySet<string>): ApplyResult {
  const result: ApplyResult = { days, applied: [], skipped: [], touched: [], added: {} }
  for (const change of proposal.changes) {
    if (selected && !selected.has(change.id)) continue
    const before = result.days
    result.days = applyChange(before, change, result)
    if (result.days !== before) result.applied.push(change.id)
  }
  return result
}

export type DaySnapshot = Array<{ dayId: string; items: ItineraryItem[] }>

/** The items of the touched days as they were, for Undo. */
export function snapshotDays(days: TripDay[], touched: readonly string[]): DaySnapshot {
  return days.filter((day) => touched.includes(day.id)).map((day) => ({ dayId: day.id, items: day.items }))
}

/** Key order is not meaningful in a stored document, so it is fixed before comparing. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/**
 * The items of some days as one comparable string. Undo restores whole days,
 * so it is safe only while this still matches what the apply left behind.
 * A day that is gone reads as missing, which never matches.
 */
export function daysFingerprint(days: readonly TripDay[], dayIds: readonly string[]): string {
  return dayIds.map((id) => `${id}=${stable(days.find((d) => d.id === id)?.items ?? null)}`).join("|")
}

export function restoreSnapshot(days: TripDay[], snapshot: DaySnapshot): TripDay[] {
  return days.map((day) => {
    const saved = snapshot.find((s) => s.dayId === day.id)
    return saved ? { ...day, items: saved.items } : day
  })
}

export interface ChangeLine {
  op: ProposalChange["op"]
  /** Mono column on the left: a time, or a short verb. */
  lead: string
  title: string
  detail: string
}

/** The one day every change of a proposal is about, if there is one. */
export function proposalDay(proposal: ConciergeProposal, days: TripDay[]): TripDay | undefined {
  const ids = new Set(proposal.changes.flatMap((c) => (c.op === "move" ? [c.fromDayId, c.toDayId] : [c.dayId])))
  return ids.size === 1 ? days.find((d) => d.id === [...ids][0]) : undefined
}

/** One readable row per change. `sharedDayId` is the day already named in
 *  the card's heading, which the rows then leave out. */
export function describeChange(change: ProposalChange, days: TripDay[], sharedDayId?: string): ChangeLine {
  const name = (dayId: string) => {
    if (dayId === sharedDayId) return ""
    const day = days.find((d) => d.id === dayId)
    return day ? dayShort(day) : "a day that was removed"
  }
  switch (change.op) {
    case "add":
      return {
        op: "add",
        lead: change.time ?? "Add",
        title: change.place.name,
        detail: [name(change.dayId), change.notes].filter(Boolean).join(" · "),
      }
    case "set_time":
      return {
        op: "set_time",
        lead: change.time,
        title: change.title,
        detail: [name(change.dayId), change.from ? `was ${change.from}` : ""].filter(Boolean).join(" · "),
      }
    case "move":
      return {
        op: "move",
        lead: change.time ?? "Move",
        title: change.title,
        detail: `${name(change.fromDayId)} → ${name(change.toDayId)}`,
      }
    case "remove":
      return { op: "remove", lead: "Remove", title: change.title, detail: name(change.dayId) }
    case "reorder":
      return { op: "reorder", lead: "Order", title: `Reorder ${name(change.dayId) || "the day"}`, detail: change.titles.join(" → ") }
  }
}

/** Button label: "Apply", "Apply 4 changes", "Remove it". */
export function applyLabel(proposal: ConciergeProposal, count: number): string {
  if (count === 1 && proposal.changes.length === 1) {
    const only = proposal.changes[0]!
    if (only.op === "remove") return "Remove it"
    if (only.op === "add") return "Add it"
    return "Apply"
  }
  return count === proposal.changes.length ? `Apply all ${count}` : `Apply ${count} of ${proposal.changes.length}`
}
