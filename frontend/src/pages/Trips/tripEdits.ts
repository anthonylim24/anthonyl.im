import type { ItineraryItem, ItemKind, TripDay } from "./types"

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

export function addItem(days: TripDay[], dayId: string, item: ItineraryItem, index?: number): TripDay[] {
  return mapDay(days, dayId, (day) => {
    const items = [...day.items]
    items.splice(index ?? items.length, 0, item)
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

/** Move an item to the end of another day. */
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
    const items = [...day.items]
    items.splice(idx + 1, 0, copy)
    return { ...day, items }
  })
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
