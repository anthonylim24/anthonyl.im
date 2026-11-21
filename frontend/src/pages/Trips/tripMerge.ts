import type { Trip, TripDay } from "./types"

// Three-way merge of a trip document. `base` is the version the traveller's
// edits started from, `mine` is the editor's working copy, `theirs` is what
// the server holds now (the concierge, a collaborator, an AI run). The
// result is `theirs` with the traveller's changes replayed on top, or null
// when that can't be done without silently dropping somebody's work.
//
// Rules, per day:
// - a day only one side touched takes that side's version;
// - for a day both touched, items merge by id: the traveller's edit to an
//   item wins, items they added and items the other side added are both
//   kept, an item the other side deleted goes unless the traveller edited it,
//   an item the traveller deleted stays deleted;
// - a day field (title, city, notes) both sides changed differently, or a
//   change to the list of days on both sides, is a real conflict: null.

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
 * Trip-level lists of records with ids (the party, expenses, the checklist).
 * They merge entry by entry like a day's items, so two people adding at the
 * same time both keep what they added.
 */
export const TRIP_LISTS = ["party", "expenses", "checklist"] as const satisfies readonly (keyof Trip)[]

const DAY_FIELDS = ["date", "title", "city", "notes", "weather", "callouts"] as const satisfies readonly (keyof TripDay)[]

const NO_MERGE = Symbol("conflict")
type Merged<T> = T | typeof NO_MERGE

function pick<T>(base: T, mine: T, theirs: T): Merged<T> {
  if (sameJson(mine, base)) return theirs
  if (sameJson(theirs, base) || sameJson(mine, theirs)) return mine
  return NO_MERGE
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Ids in `list` that are also in `keep`, in `list`'s order. */
const common = (list: readonly { id: string }[], keep: ReadonlySet<string>) => list.map((x) => x.id).filter((id) => keep.has(id))

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

export function mergeItems<T extends { id: string }>(base: readonly T[], mine: readonly T[], theirs: readonly T[]): T[] {
  const b = new Map(base.map((i) => [i.id, i]))
  const m = new Map(mine.map((i) => [i.id, i]))
  const t = new Map(theirs.map((i) => [i.id, i]))
  const result = new Map<string, T>()
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    const bi = b.get(id)
    const mi = m.get(id)
    const ti = t.get(id)
    if (!bi) result.set(id, (mi ?? ti)!) // new on one side (or, rarely, both): keep it
    else if (mi && ti) result.set(id, sameJson(mi, bi) ? ti : mi)
    else if (mi && !sameJson(mi, bi)) result.set(id, mi) // they deleted it, the traveller edited it
    // else: deleted on one side and untouched on the other: gone
  }
  const survivors = new Set(result.keys())
  const inBase = new Set(b.keys())
  const mineMoved = !sameOrder(common(mine, inBase), common(base, new Set(m.keys())))
  const order = mineMoved
    ? arrange(mine.map((i) => i.id), theirs.map((i) => i.id), survivors)
    : arrange(theirs.map((i) => i.id), mine.map((i) => i.id), survivors)
  return order.map((id) => result.get(id)!)
}

function mergeDay(base: TripDay, mine: TripDay, theirs: TripDay): Merged<TripDay> {
  if (sameJson(mine, base)) return theirs
  if (sameJson(theirs, base) || sameJson(mine, theirs)) return mine
  const out: TripDay = { ...theirs, items: mergeItems(base.items, mine.items, theirs.items) }
  for (const field of DAY_FIELDS) {
    const value = pick(base[field], mine[field], theirs[field])
    if (value === NO_MERGE) return NO_MERGE
    ;(out as unknown as Record<string, unknown>)[field] = value
  }
  return out
}

export function mergeDays(base: readonly TripDay[], mine: readonly TripDay[], theirs: readonly TripDay[]): TripDay[] | null {
  const ids = (days: readonly TripDay[]) => days.map((d) => d.id)
  const baseIds = ids(base)
  const mineChanged = !sameOrder(ids(mine), baseIds)
  const theirsChanged = !sameOrder(ids(theirs), baseIds)
  if (mineChanged && theirsChanged && !sameOrder(ids(mine), ids(theirs))) return null
  const layout = mineChanged ? mine : theirs
  const b = new Map(base.map((d) => [d.id, d]))
  const m = new Map(mine.map((d) => [d.id, d]))
  const t = new Map(theirs.map((d) => [d.id, d]))
  // A day one side dropped (shorter dates) while the other side changed it:
  // keeping either version loses the other's work, so ask.
  for (const [id, day] of b) {
    const mi = m.get(id)
    const ti = t.get(id)
    if (!mi && ti && !sameJson(ti, day)) return null
    if (!ti && mi && !sameJson(mi, day)) return null
  }
  const out: TripDay[] = []
  for (const { id } of layout) {
    const bd = b.get(id)
    const md = m.get(id)
    const td = t.get(id)
    if (!md || !td || !bd) {
      out.push((md ?? td)!)
      continue
    }
    const merged = mergeDay(bd, md, td)
    if (merged === NO_MERGE) return null
    out.push(merged)
  }
  return out
}

/** `theirs` with the traveller's changes since `base` replayed on top, or null on a real conflict. */
export function rebaseTrip(base: Trip, mine: Trip, theirs: Trip): Trip | null {
  const days = mergeDays(base.days, mine.days, theirs.days)
  if (!days) return null
  const out: Trip = { ...theirs, days }
  for (const field of TRIP_FIELDS) {
    const value = pick(base[field], mine[field], theirs[field])
    if (value === NO_MERGE) return null
    ;(out as unknown as Record<string, unknown>)[field] = value
  }
  for (const field of TRIP_LISTS) {
    const b = base[field] as readonly { id: string }[] | undefined
    const m = mine[field] as readonly { id: string }[] | undefined
    const t = theirs[field] as readonly { id: string }[] | undefined
    if (sameJson(m, b)) continue // theirs already
    const merged = sameJson(t, b) ? m : mergeItems(b ?? [], m ?? [], t ?? [])
    ;(out as unknown as Record<string, unknown>)[field] = merged
  }
  return out
}
