import type { ConciergePlace } from "../../lib/conciergeGrounding"
import { clockMinutes, dayStarts } from "./dayClock"
import { LIMITS } from "./limits"
import { isToSchedule } from "./map/geo"
import type { ItemStatus, ItemTheme, ItineraryItem, ItemKind, Trip, TripDay, TripLocation } from "./types"

// Pure itinerary-mutation helpers behind the editor UI. Every function
// returns new arrays (no in-place mutation) so React state updates and the
// debounced PATCH save stay predictable.

export function makeItem(kind: ItemKind, title = ""): ItineraryItem {
  return {
    id: `it-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    title,
    status: "none",
    createdBy: "user",
  }
}

function mapDay(days: TripDay[], dayId: string, fn: (day: TripDay) => TripDay): TripDay[] {
  return days.map((d) => (d.id === dayId ? fn(d) : d))
}

/**
 * Where the day's plan ends: the "To schedule" heading, or the end of the list.
 * Everything from there on is parked off the route (`splitDay`).
 */
function planEnd(items: readonly ItineraryItem[]): number {
  const at = items.findIndex(isToSchedule)
  return at < 0 ? items.length : at
}

/** Last on the route: above a "To schedule" heading, whose places stay parked. */
export function insertBeforeParked(items: readonly ItineraryItem[], item: ItineraryItem): ItineraryItem[] {
  const at = planEnd(items)
  return [...items.slice(0, at), item, ...items.slice(at)]
}

/** Add an item to the end of a day's plan (never under its "To schedule" heading). */
export function addItem(days: TripDay[], dayId: string, item: ItineraryItem): TripDay[] {
  return mapDay(days, dayId, (day) => ({ ...day, items: insertBeforeParked(day.items, item) }))
}

/**
 * Insert an item where its time says it belongs on the route. Untimed items,
 * and items on a day with no times at all, go last on the route. Either way
 * they land above a "To schedule" heading: what is parked under it stays
 * parked, and its times are not the route's. Existing times are read on the
 * day's clock (`dayStarts`), so a 22:00 stop lands before a 01:00 one listed
 * after a late dinner. Mirrors the server's `insertByTime` (server/src/trips/dayClock.ts).
 */
export function insertByTime(items: readonly ItineraryItem[], item: ItineraryItem): ItineraryItem[] {
  const end = planEnd(items)
  const plan = items.slice(0, end)
  const parked = items.slice(end)
  const start = clockMinutes(item.time)
  const starts = dayStarts(plan)
  if (start === null || starts.every((s) => s === null)) return [...plan, item, ...parked]
  let at = plan.length
  for (let i = 0; i < plan.length; i++) {
    if (starts[i] !== null && starts[i]! > start) {
      at = i
      break
    }
  }
  // Don't strand the new item above a heading that introduces the next block.
  while (at > 0 && plan[at - 1]!.kind === "section" && (starts[at - 1] === null || starts[at - 1]! > start)) at -= 1
  return [...plan.slice(0, at), item, ...plan.slice(at), ...parked]
}

/**
 * Set or clear a stop's start. A place parked under "To schedule" that is
 * given a time joins the route at that time, as the heading's hint promises.
 */
export function setItemTime(days: TripDay[], dayId: string, itemId: string, time: string | undefined): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const at = day.items.findIndex((i) => i.id === itemId)
    if (at < 0) return day
    const item: ItineraryItem = { ...day.items[at]!, time }
    if (time && at > planEnd(day.items)) return { ...day, items: insertByTime(day.items.filter((_, i) => i !== at), item) }
    return { ...day, items: day.items.map((existing, i) => (i === at ? item : existing)) }
  })
}

/**
 * Take the "To schedule" heading away and keep its places: they join the
 * end of the route, in the order they were parked.
 */
export function unparkDay(days: TripDay[], dayId: string): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const items = day.items.filter((item) => !isToSchedule(item))
    return items.length === day.items.length ? day : { ...day, items }
  })
}

/** Insert an item at a position, clamped into range — the undo path for a
 *  deleted item, which must land back where it was. */
export function insertItemAt(days: TripDay[], dayId: string, item: ItineraryItem, index: number): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const items = [...day.items]
    items.splice(Math.min(Math.max(index, 0), items.length), 0, item)
    return { ...day, items }
  })
}

export function updateItem(
  days: TripDay[],
  dayId: string,
  itemId: string,
  patch: Partial<Omit<ItineraryItem, "id">>,
): TripDay[] {
  return mapDay(days, dayId, (day) => ({
    ...day,
    items: day.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
  }))
}

export function removeItem(days: TripDay[], dayId: string, itemId: string): TripDay[] {
  return mapDay(days, dayId, (day) => ({ ...day, items: day.items.filter((i) => i.id !== itemId) }))
}

/** Move an item up (-1) or down (+1) within its day. No-op at the edges. */
export function moveItem(days: TripDay[], dayId: string, itemId: string, direction: -1 | 1): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const idx = day.items.findIndex((i) => i.id === itemId)
    const target = idx + direction
    if (idx < 0 || target < 0 || target >= day.items.length) return day
    const items = [...day.items]
    const [moved] = items.splice(idx, 1)
    items.splice(target, 0, moved!)
    return { ...day, items }
  })
}

/** Move an item to the end of another day's plan (above its "To schedule" heading). */
export function moveItemToDay(days: TripDay[], fromDayId: string, itemId: string, toDayId: string): TripDay[] {
  if (fromDayId === toDayId) return days
  const item = days.find((d) => d.id === fromDayId)?.items.find((i) => i.id === itemId)
  if (!item) return days
  return addItem(removeItem(days, fromDayId, itemId), toDayId, item)
}

export function duplicateItem(days: TripDay[], dayId: string, itemId: string): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const idx = day.items.findIndex((i) => i.id === itemId)
    if (idx < 0) return day
    const copy: ItineraryItem = {
      ...structuredClone(day.items[idx]!),
      id: `it-${crypto.randomUUID().slice(0, 8)}`,
    }
    // The wishlist lists the place once: the copy is the traveller's own.
    delete copy.fromWishlist
    const items = [...day.items]
    items.splice(idx + 1, 0, copy)
    return { ...day, items }
  })
}

/** What a stop goes back to when Done or Skip is taken off: a booking stays booked. */
export function restingStatus(item: Pick<ItineraryItem, "kind" | "reservation">): ItemStatus {
  return item.kind === "reservation" || item.reservation ? "booked" : "none"
}

/** Done and Skip are toggles: pressing the one already set puts the stop back at rest. */
export function toggledStatus(item: Pick<ItineraryItem, "kind" | "reservation" | "status">, status: "completed" | "skipped"): ItemStatus {
  return item.status === status ? restingStatus(item) : status
}

// ── Ideas: places saved for later, on no day yet ─────────────────────────
// These edit the trip document (`ideas` and `days` together), so a stop
// moves between a day and the ideas list in one step.

type IdeaDoc = Pick<Trip, "days" | "ideas">

export const ideasFull = (trip: Pick<Trip, "ideas">) => (trip.ideas?.length ?? 0) >= LIMITS.ideas
export const dayFull = (day: Pick<TripDay, "items">) => day.items.length >= LIMITS.itemsPerDay

/** A stop as an idea: no day, so no time, and nothing about how the day went. */
function asIdea(item: ItineraryItem): ItineraryItem {
  const idea: ItineraryItem = { ...item }
  delete idea.time
  delete idea.endTime
  delete idea.highlight
  delete idea.fromWishlist
  if (idea.status === "completed" || idea.status === "skipped") idea.status = restingStatus(idea)
  return idea
}

/** Save a new place for later. */
export function addIdea<T extends IdeaDoc>(trip: T, item: ItineraryItem): T {
  if (ideasFull(trip)) return trip
  return { ...trip, ideas: [...(trip.ideas ?? []), asIdea(item)] }
}

export function removeIdea<T extends IdeaDoc>(trip: T, ideaId: string): T {
  const ideas = trip.ideas ?? []
  return ideas.some((i) => i.id === ideaId) ? { ...trip, ideas: ideas.filter((i) => i.id !== ideaId) } : trip
}

/**
 * Set an idea's wishlist category, or with null go back to inferring it
 * (the key is removed, not set to undefined, so the document says nothing).
 * Unchanged, it returns the same trip, so no empty undo step is recorded.
 */
export function setIdeaTheme<T extends IdeaDoc>(trip: T, ideaId: string, theme: ItemTheme | null): T {
  const ideas = trip.ideas ?? []
  const idea = ideas.find((i) => i.id === ideaId)
  if (!idea || (idea.theme ?? null) === theme) return trip
  const next: ItineraryItem = { ...idea }
  if (theme) next.theme = theme
  else delete next.theme
  return { ...trip, ideas: ideas.map((i) => (i.id === ideaId ? next : i)) }
}

/** Take a stop off its day and keep it in the ideas list. */
export function saveForLater<T extends IdeaDoc>(trip: T, dayId: string, itemId: string): T {
  const item = trip.days.find((d) => d.id === dayId)?.items.find((i) => i.id === itemId)
  if (!item || ideasFull(trip)) return trip
  const ideas = (trip.ideas ?? []).filter((i) => i.id !== itemId)
  return { ...trip, days: removeItem(trip.days, dayId, itemId), ideas: [...ideas, asIdea(item)] }
}

/** Put an idea on a day: last on its route, above any "To schedule" heading. */
export function ideaToDay<T extends IdeaDoc>(trip: T, ideaId: string, dayId: string): T {
  const idea = trip.ideas?.find((i) => i.id === ideaId)
  const day = trip.days.find((d) => d.id === dayId)
  if (!idea || !day || dayFull(day)) return trip
  // Ids are unique across the trip; a copy already on a day must not share one.
  const taken = trip.days.some((d) => d.items.some((i) => i.id === idea.id))
  const item: ItineraryItem = { ...idea, ...(taken ? { id: makeItem(idea.kind).id } : {}), fromWishlist: true }
  return { ...trip, ideas: trip.ideas!.filter((i) => i.id !== ideaId), days: addItem(trip.days, dayId, item) }
}

/** Convert a note into a place item, seeding the location from the title. */
export function convertNoteToPlace(days: TripDay[], dayId: string, itemId: string): TripDay[] {
  return mapDay(days, dayId, (day) => ({
    ...day,
    items: day.items.map((i) =>
      i.id === itemId && i.kind === "note"
        ? { ...i, kind: "place" as const, location: i.location ?? { name: i.title, source: "user" as const } }
        : i,
    ),
  }))
}

export function itemFromConciergePlace(place: ConciergePlace): ItineraryItem {
  const location: TripLocation = {
    name: place.name,
    source: "ai",
    confidence: place.lat != null && place.lng != null ? "high" : "medium",
  }
  if (place.address) location.address = place.address
  if (typeof place.lat === "number") location.lat = place.lat
  if (typeof place.lng === "number") location.lng = place.lng
  if (place.category) location.category = place.category
  if (place.placeId) location.placeId = place.placeId
  return {
    ...makeItem("place", place.name),
    notes: place.notes?.trim() || undefined,
    links: place.mapsUrl ? [place.mapsUrl] : undefined,
    createdBy: "ai",
    location,
  }
}

function placeKey(name: string): string {
  return name.trim().toLowerCase()
}

/** True when this day already has a place with the same name. */
export function dayHasPlaceNamed(day: TripDay, name: string): boolean {
  const key = placeKey(name)
  return day.items.some((i) => {
    if (i.kind !== "place") return false
    return placeKey(i.title) === key || placeKey(i.location?.name ?? "") === key
  })
}
