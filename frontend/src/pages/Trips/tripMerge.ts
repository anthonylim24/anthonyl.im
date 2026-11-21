import type { Trip, TripDay } from "./types"

// Three-way merge of a trip document. `base` is the version the traveller's
// edits started from, `mine` is the editor's working copy, `theirs` is what
// the server holds now (the concierge, a collaborator, an AI run).
//
// `rebaseTrip` replays the traveller's changes onto `theirs` and gives up
// (null) when that can't be done without silently dropping somebody's work.
// `resolveTrip` is the same merge after the traveller has answered "Keep
// mine" or "Use theirs": everything that merges cleanly still merges, and
// only the parts that truly clash go to the side they chose. One merge with
// an optional side, so the two can never drift apart.
//
// Rules, per day:
// - a day only one side touched takes that side's version;
// - for a day both touched, items merge by id: the traveller's edit to an
//   item wins, items they added and items the other side added are both
//   kept, an item the other side deleted goes unless the traveller edited it,
//   an item the traveller deleted stays deleted (with "Use theirs", their
//   edit or deletion wins instead);
// - a day field (title, city, notes, …) both sides changed differently, or a
//   change to the list of days on both sides, is a real conflict. Resolved,
//   the chosen side's list of days wins together with its dates, so the days
//   always match the trip's start and end.

/** Structural equality for JSON documents; `undefined` properties count as absent. */
export function sameJson(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return false
  if (Array.isArray(x) !== Array.isArray(y)) return false
  if (Array.isArray(x)) {
    const ys = y as unknown[]
    return x.length === ys.length && x.every((v, i) => sameJson(v, ys[i]))
  }
  const xo = x as Record<string, unknown>
  const yo = y as Record<string, unknown>
  const keys = new Set([...Object.keys(xo), ...Object.keys(yo)])
  for (const key of keys) if (!sameJson(xo[key], yo[key])) return false
  return true
}

/** Fields the editor sends in a PATCH, besides `days`. Each merges on its own. */
export const TRIP_FIELDS = [
  "name",
  "status",
  "slug",
  "appearance",
  "destinations",
  "startDate",
  "endDate",
  "timezone",
  "tags",
  "description",
  "center",
  "budget",
] as const satisfies readonly (keyof Trip)[]

/**
 * Trip-level lists of records with ids (the party, expenses, the checklist, ideas).
 * They merge entry by entry like a day's items, so two people adding at the
 * same time both keep what they added.
 */
export const TRIP_LISTS = ["party", "expenses", "checklist", "ideas"] as const satisfies readonly (keyof Trip)[]

/** Who wins a true conflict. Without one, a conflict makes the merge fail. */
export type Side = "mine" | "theirs"

const NO_MERGE = Symbol("conflict")
type Merged<T> = T | typeof NO_MERGE

function pick<T>(base: T, mine: T, theirs: T, side?: Side): Merged<T> {
  if (sameJson(mine, base)) return theirs
  if (sameJson(theirs, base) || sameJson(mine, theirs)) return mine
  return side === "mine" ? mine : side === "theirs" ? theirs : NO_MERGE
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Ids in `list` that are also in `keep`, in `list`'s order. */
const common = (list: readonly { id: string }[], keep: ReadonlySet<string>) => list.map((x) => x.id).filter((id) => keep.has(id))

/** True when `side` put the entries it shares with `base` in another order. */
function reordered(base: readonly { id: string }[], side: readonly { id: string }[]): boolean {
  return !sameOrder(common(side, new Set(base.map((x) => x.id))), common(base, new Set(side.map((x) => x.id))))
}

/**
 * Lay out `survivors` in `primary`'s order, then slot each id only
 * `secondary` has in after the item it followed there.
 */
function arrange(primary: readonly string[], secondary: readonly string[], survivors: ReadonlySet<string>): string[] {
  const out = primary.filter((id) => survivors.has(id))
  const placed = new Set(out)
  let after: string | null = null
  for (const id of secondary) {
    if (!survivors.has(id)) continue
    if (!placed.has(id)) {
      const at = after === null ? 0 : out.indexOf(after) + 1
      out.splice(at, 0, id)
      placed.add(id)
    }
    after = id
  }
  return out
}

/**
 * Merge a list of records by id. Never a conflict: an entry both sides
 * changed, or one side deleted while the other edited it, goes to `side`
 * (the traveller's by default, which is what a rebase wants).
 */
export function mergeItems<T extends { id: string }>(base: readonly T[], mine: readonly T[], theirs: readonly T[], side: Side = "mine"): T[] {
  const b = new Map(base.map((i) => [i.id, i]))
  const m = new Map(mine.map((i) => [i.id, i]))
  const t = new Map(theirs.map((i) => [i.id, i]))
  const result = new Map<string, T>()
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    const bi = b.get(id)
    const mi = m.get(id)
    const ti = t.get(id)
    if (!bi) result.set(id, (side === "theirs" ? (ti ?? mi) : (mi ?? ti))!) // new on one side (or, rarely, both): keep it
    else if (mi && ti) result.set(id, sameJson(mi, bi) ? ti : sameJson(ti, bi) ? mi : side === "mine" ? mi : ti)
    // Deleted on one side: gone, unless the other side edited it and wins.
    else if (mi && side === "mine" && !sameJson(mi, bi)) result.set(id, mi)
    else if (ti && side === "theirs" && !sameJson(ti, bi)) result.set(id, ti)
  }
  const survivors = new Set(result.keys())
  const mineMoved = reordered(base, mine)
  const mineLeads = side === "mine" ? mineMoved : mineMoved && !reordered(base, theirs)
  const order = mineLeads
    ? arrange(mine.map((i) => i.id), theirs.map((i) => i.id), survivors)
    : arrange(theirs.map((i) => i.id), mine.map((i) => i.id), survivors)
  return order.map((id) => result.get(id)!)
}

/** Every field a day carries besides its id and stops, so a field added later merges too. */
function dayFields(...days: TripDay[]): string[] {
  const keys = new Set(days.flatMap((d) => Object.keys(d)))
  keys.delete("id")
  keys.delete("items")
  return [...keys]
}

function mergeDay(base: TripDay, mine: TripDay, theirs: TripDay, side?: Side): Merged<TripDay> {
  if (sameJson(mine, base)) return theirs
  if (sameJson(theirs, base) || sameJson(mine, theirs)) return mine
  const out: Record<string, unknown> = { ...theirs, items: mergeItems(base.items, mine.items, theirs.items, side) }
  const [b, m, t] = [base, mine, theirs] as unknown as Record<string, unknown>[]
  for (const field of dayFields(base, mine, theirs)) {
    const value = pick(b![field], m![field], t![field], side)
    if (value === NO_MERGE) return NO_MERGE
    if (value === undefined) delete out[field]
    else out[field] = value
  }
  return out as unknown as TripDay
}

interface MergedPlan {
  days: TripDay[]
  /** The side whose list of days (and so whose dates) won a clash; null when the lists merged. */
  layoutFrom: Side | null
}

function mergePlan(base: readonly TripDay[], mine: readonly TripDay[], theirs: readonly TripDay[], side?: Side): Merged<MergedPlan> {
  const ids = (days: readonly TripDay[]) => days.map((d) => d.id)
  const baseIds = ids(base)
  const mineChanged = !sameOrder(ids(mine), baseIds)
  const theirsChanged = !sameOrder(ids(theirs), baseIds)
  const b = new Map(base.map((d) => [d.id, d]))
  const m = new Map(mine.map((d) => [d.id, d]))
  const t = new Map(theirs.map((d) => [d.id, d]))
  // Both changed the list of days differently, or one side dropped a day
  // (shorter dates) that the other changed: keeping either list loses the
  // other's work.
  const clash =
    (mineChanged && theirsChanged && !sameOrder(ids(mine), ids(theirs))) ||
    [...b].some(([id, day]) => {
      const mi = m.get(id)
      const ti = t.get(id)
      return (!mi && ti !== undefined && !sameJson(ti, day)) || (!ti && mi !== undefined && !sameJson(mi, day))
    })
  if (clash && !side) return NO_MERGE
  const layoutFrom = clash && side ? side : null
  const layout = layoutFrom ? (layoutFrom === "mine" ? mine : theirs) : mineChanged ? mine : theirs
  const days: TripDay[] = []
  for (const { id } of layout) {
    const bd = b.get(id)
    const md = m.get(id)
    const td = t.get(id)
    if (!md || !td || !bd) {
      days.push((side === "theirs" ? (td ?? md) : (md ?? td))!)
      continue
    }
    const merged = mergeDay(bd, md, td, side)
    if (merged === NO_MERGE) return NO_MERGE
    days.push(merged)
  }
  return { days, layoutFrom }
}

export function mergeDays(base: readonly TripDay[], mine: readonly TripDay[], theirs: readonly TripDay[]): TripDay[] | null {
  const plan = mergePlan(base, mine, theirs)
  return plan === NO_MERGE ? null : plan.days
}

function mergeTrip(base: Trip, mine: Trip, theirs: Trip, side: Side): Trip
function mergeTrip(base: Trip, mine: Trip, theirs: Trip): Trip | null
function mergeTrip(base: Trip, mine: Trip, theirs: Trip, side?: Side): Trip | null {
  const plan = mergePlan(base.days, mine.days, theirs.days, side)
  if (plan === NO_MERGE) return null
  const out: Record<string, unknown> = { ...theirs, days: plan.days }
  const [b, m, t] = [base, mine, theirs] as unknown as Record<string, unknown>[]
  for (const field of TRIP_FIELDS) {
    // Days that won as a whole bring their dates with them.
    const value =
      plan.layoutFrom && (field === "startDate" || field === "endDate")
        ? (plan.layoutFrom === "mine" ? mine : theirs)[field]
        : pick(b![field], m![field], t![field], side)
    if (value === NO_MERGE) return null
    if (value === undefined) delete out[field]
    else out[field] = value
  }
  for (const field of TRIP_LISTS) {
    const bl = base[field] as readonly { id: string }[] | undefined
    const ml = mine[field] as readonly { id: string }[] | undefined
    const tl = theirs[field] as readonly { id: string }[] | undefined
    if (sameJson(ml, bl)) continue // theirs already
    out[field] = sameJson(tl, bl) ? ml : mergeItems(bl ?? [], ml ?? [], tl ?? [], side)
  }
  return out as unknown as Trip
}

/** `theirs` with the traveller's changes since `base` replayed on top, or null on a real conflict. */
export function rebaseTrip(base: Trip, mine: Trip, theirs: Trip): Trip | null {
  return mergeTrip(base, mine, theirs)
}

/**
 * Settle a conflict the traveller has decided: the same merge as
 * `rebaseTrip`, with every true clash going to `side`. "Keep mine" still
 * keeps the stops someone else added on other days; "Use theirs" still
 * keeps the traveller's edits that clash with nothing.
 */
export function resolveTrip(base: Trip, mine: Trip, theirs: Trip, side: Side): Trip {
  return mergeTrip(base, mine, theirs, side)
}
