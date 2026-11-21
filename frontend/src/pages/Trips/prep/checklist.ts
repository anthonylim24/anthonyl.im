import { daysBetween } from "../meta"
import type { ChecklistGroup, ChecklistItem, ItineraryItem, Trip } from "../types"
import { COUNTRIES, isCountryCode, type Country } from "./countries"
import { countriesFor, plugsToAdapt, voltageDiffers } from "./essentials"

// The trip checklist: its groups, progress, the pure edits the panel makes,
// and suggestions read off the plan (weather, places, bookings, length).

export const GROUPS: ReadonlyArray<{ id: ChecklistGroup; label: string }> = [
  { id: "packing", label: "Packing" },
  { id: "todo", label: "Before you go" },
  { id: "documents", label: "Documents" },
]

export interface Progress {
  done: number
  total: number
}

export function progress(items: readonly ChecklistItem[]): Progress {
  return { done: items.filter((item) => item.done).length, total: items.length }
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (v) => v.toString(16).padStart(2, "0")).join("")
}

/** A fresh entry. Call it in an event handler, never inside an `onEdit` updater (it may run twice). */
export function newChecklistItem(text: string, group: ChecklistGroup): ChecklistItem {
  return { id: `ck-${randomHex(4)}`, text: text.trim(), done: false, group, createdAt: new Date().toISOString() }
}

/** "Anthony Lim" → "AL", "Ana" → "A", "김민수" → "김". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = Array.from(words[0] ?? "")[0] ?? ""
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? "")[0] ?? "") : ""
  return (first + last).toUpperCase() || "?"
}

/** Whether the list already has an entry with this text (case, spacing and curly quotes ignored). */
export function hasText(list: ReadonlyArray<Pick<ChecklistItem, "text">>, text: string): boolean {
  const k = key(text)
  return list.some((item) => key(item.text) === k)
}

// ── Edits (each returns the same array when nothing changes) ─────────────

export function addItems(list: readonly ChecklistItem[], items: readonly ChecklistItem[]): ChecklistItem[] {
  const ids = new Set(list.map((item) => item.id))
  const fresh = items.filter((item) => !ids.has(item.id))
  return fresh.length > 0 ? [...list, ...fresh] : (list as ChecklistItem[])
}

export function setDone(list: readonly ChecklistItem[], id: string, done: boolean): ChecklistItem[] {
  return patch(list, id, (item) => (item.done === done ? item : { ...item, done }))
}

export function renameItem(list: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] {
  const clean = text.trim()
  return patch(list, id, (item) => (clean === "" || clean === item.text ? item : { ...item, text: clean }))
}

/** `personId` undefined unassigns. */
export function assignItem(list: readonly ChecklistItem[], id: string, personId: string | undefined): ChecklistItem[] {
  return patch(list, id, (item) => {
    if (item.assignee === personId) return item
    const next = { ...item, assignee: personId }
    if (personId === undefined) delete next.assignee
    return next
  })
}

function patch(list: readonly ChecklistItem[], id: string, fn: (item: ChecklistItem) => ChecklistItem): ChecklistItem[] {
  let changed = false
  const next = list.map((item) => {
    if (item.id !== id) return item
    const updated = fn(item)
    if (updated !== item) changed = true
    return updated
  })
  return changed ? next : (list as ChecklistItem[])
}

/** An entry taken out of the list, with where it stood, so Undo can put it back. */
export interface Removed {
  item: ChecklistItem
  index: number
}

export function removeItems(list: readonly ChecklistItem[], ids: readonly string[]): { list: ChecklistItem[]; removed: Removed[] } {
  const drop = new Set(ids)
  const removed: Removed[] = []
  list.forEach((item, index) => {
    if (drop.has(item.id)) removed.push({ item, index })
  })
  if (removed.length === 0) return { list: list as ChecklistItem[], removed }
  return { list: list.filter((item) => !drop.has(item.id)), removed }
}

/** Put removed entries back where they stood; any already back (same id) are skipped. */
export function restoreItems(list: readonly ChecklistItem[], removed: readonly Removed[]): ChecklistItem[] {
  const present = new Set(list.map((item) => item.id))
  const missing = removed.filter((entry) => !present.has(entry.item.id)).sort((x, y) => x.index - y.index)
  if (missing.length === 0) return list as ChecklistItem[]
  const next = [...list]
  for (const entry of missing) next.splice(Math.min(entry.index, next.length), 0, entry.item)
  return next
}

// ── Suggestions ──────────────────────────────────────────────────────────

export interface ChecklistSuggestion {
  text: string
  group: ChecklistGroup
}

interface Rule extends ChecklistSuggestion {
  /** Existing entries that already cover this one, for the few whose wording varies with the trip. */
  covers?: RegExp
}

const BEACH = /\b(beach|beaches|playa|praia|plage|snorkel\w*|scuba|diving|swim\w*|lagoon|water ?park|hot springs?|thermal baths?|pool)\b/
const HIKE = /\b(hik(e|es|ing)|trails?|trek\w*|mountains?|summit|volcano|national park|gorge)\b/
const SACRED = /\b(temples?|shrines?|church(es)?|cathedrals?|mosques?|basilicas?|monaster(y|ies)|pagodas?|abbey|chapel|synagogue|jinja|taisha|wat)\b|\w-(ji|dera)\b/
const BATHHOUSE = /\b(onsen|sento|jjimjilbang|hammam|bathhouse|sauna)\b/
const RAIN = /\b(rain\w*|showers?|drizzle|storms?|thunder\w*)\b/i
const TRAIN = /\b(train|rail\w*|shinkansen|ktx|srt|tgv|eurostar|amtrak|intercity)\b/
const FERRY = /\b(ferry|boat|catamaran)\b/
const BUS = /\b(bus|coach)\b/
const CAR = /\b(car rental|rental car|hire car|car hire|rent a car|campervan|motorhome)\b/

function itemText(item: ItineraryItem): string {
  return `${item.title} ${item.location?.name ?? ""} ${item.location?.category ?? ""}`.toLowerCase()
}

const isBooking = (item: ItineraryItem) => item.kind === "reservation" || item.reservation !== undefined

/**
 * What the plan suggests packing, doing and carrying, deterministic for a
 * given trip. Entries whose text is already on the list (ignoring case and
 * spacing) are left out. `homeCountry` (ISO2) decides whether an adapter,
 * a passport and an eSIM are needed; without it those are suggested
 * generically.
 */
export function suggestChecklist(
  trip: Trip,
  existing: ReadonlyArray<Pick<ChecklistItem, "text">>,
  homeCountry?: string,
): ChecklistSuggestion[] {
  const rules: Rule[] = []
  const add = (group: ChecklistGroup, text: string, covers?: RegExp) => rules.push({ group, text, covers })

  const destinations = countriesFor(trip)
  const home: Country | undefined = isCountryCode(homeCountry) ? COUNTRIES[homeCountry] : undefined
  const abroad = home ? destinations.filter((country) => country.code !== home.code) : []
  const domestic = home !== undefined && destinations.length > 0 && abroad.length === 0

  // Essentials
  add("documents", home && abroad.length > 0 ? "Passport" : "Passport or ID", /passport/i)
  add("packing", "Phone charger")
  const adapter = adapterText(home, destinations, abroad)
  if (adapter) add("packing", adapter, /adapter/i)
  if (home && abroad.some((country) => voltageDiffers(home, country))) {
    add("todo", "Check hair tools and other appliances are dual voltage")
  }
  add("packing", "Medications")

  // Weather
  const weather = trip.days.flatMap((day) => (day.weather ? [day.weather] : []))
  if (weather.some((w) => w.lowC < 10)) add("packing", "Warm layers")
  if (weather.some((w) => w.highC > 26)) {
    add("packing", "Sunscreen")
    add("packing", "Sun hat")
  }
  if (weather.some((w) => RAIN.test(w.condition))) add("packing", "Umbrella or rain jacket")

  // Places on the plan
  const items = trip.days.flatMap((day) => day.items)
  const texts = items.map(itemText)
  if (texts.some((t) => BEACH.test(t))) add("packing", "Swimwear")
  if (texts.some((t) => HIKE.test(t))) add("packing", "Hiking shoes")
  if (texts.some((t) => SACRED.test(t))) add("packing", "Clothes that cover shoulders and knees")
  if (texts.some((t) => BATHHOUSE.test(t))) add("todo", "Read up on bathhouse etiquette")

  // Bookings
  const bookings = items.filter(isBooking)
  const typeOf = (item: ItineraryItem) => item.reservation?.type ?? ""
  if (bookings.some((item) => typeOf(item) === "flight")) {
    add("todo", "Check in online for flights")
    add("documents", "Boarding passes")
  }
  if (bookings.some((item) => typeOf(item) === "hotel")) add("documents", "Hotel booking confirmations")
  const transit = bookings.filter((item) => typeOf(item) === "transit").map(itemText)
  if (transit.some((t) => TRAIN.test(t))) add("documents", "Train tickets")
  if (transit.some((t) => FERRY.test(t))) add("documents", "Ferry tickets")
  if (transit.some((t) => BUS.test(t))) add("documents", "Bus tickets")
  if (bookings.some((item) => typeOf(item) === "experience" || typeOf(item) === "event")) {
    add("documents", "Tickets for tours and events")
  }
  if (texts.some((t) => CAR.test(t))) {
    add(
      "documents",
      home && abroad.length === 0 ? "Driving licence" : "Driving licence (and an international permit if needed)",
      /driving licen[cs]e|driver.?s licen[cs]e/i,
    )
  }

  // Length
  if (daysBetween(trip.startDate, trip.endDate) >= 7) {
    add("packing", "Laundry detergent sheets")
    add("todo", "Plan a laundry stop")
  }

  // Before you go
  if (home && abroad.length > 0) add("todo", "Check visa and entry requirements")
  if (!domestic) add("todo", "Tell your bank you’re travelling")
  add("todo", "Download offline maps")
  add("todo", "Buy travel insurance")
  if (!domestic) add("todo", "Set up an eSIM or roaming")

  const taken = new Set(existing.map((item) => key(item.text)))
  const out: ChecklistSuggestion[] = []
  for (const group of GROUPS) {
    for (const rule of rules) {
      if (rule.group !== group.id) continue
      const k = key(rule.text)
      if (taken.has(k)) continue
      if (rule.covers && existing.some((item) => rule.covers?.test(item.text))) continue
      taken.add(k)
      out.push({ text: rule.text, group: rule.group })
    }
  }
  return out
}

/** How two entries compare: case, spacing, curly quotes and trailing punctuation ignored. */
function key(text: string): string {
  return text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").replace(/[.!?…]+$/, "")
}

/**
 * "Power adapter (type C, F)" for the sockets the traveller's plugs don't fit;
 * nothing when they fit everywhere; a generic line when either end is unknown.
 */
function adapterText(home: Country | undefined, destinations: readonly Country[], abroad: readonly Country[]): string | null {
  if (home && destinations.length > 0) {
    const sockets = unique(abroad.flatMap((country) => plugsToAdapt(home, country)))
    return sockets.length > 0 ? `Power adapter (type ${sockets.join(", ")})` : null
  }
  const sockets = unique(destinations.flatMap((country) => country.plugs ?? []))
  return sockets.length > 0 ? `Power adapter (type ${sockets.join(", ")})` : "Power adapter"
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
