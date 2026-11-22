import { LIMITS } from "../limits"
import type { ItineraryItem, Trip, TripDay } from "../types"

// The last check before a save leaves the device. The server's zod schema
// refuses a whole PATCH over one bad field, and the editor used to resend
// that same document on every Retry, so one pasted essay blocked every save
// after it. This brings a trip inside the server's limits (`limits.ts`
// mirrors them) and says what it had to shorten.
//
// It shortens text and lists of short strings. It never drops a stop, a
// day, an expense or a checklist entry: a list of records over its limit
// is left for the server to refuse, with a reason the traveller can act on.

/** Limits `limits.ts` doesn't mirror yet (`server/src/trips/types.ts`). */
const MORE = {
  slug: 80,
  timezone: 64,
  emoji: 32,
  neighborhood: 80,
  neighborhoods: 12,
  callouts: 12,
  placeId: 256,
  category: 40,
  eyebrow: 60,
  subtitle: 120,
  headline: 600,
  splitWith: 50,
  money: 1_000_000_000,
} as const

const CLOCK = /^\d{2}:\d{2}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/
const RESERVED_SLUGS = new Set(["new", "join", "places-catalog"])

export interface Sanitized {
  trip: Trip
  /** What had to change, in words for a notice ("the notes of “Fado dinner” (day 3)"). Empty when nothing did. */
  shortened: string[]
  /** The name was blank, so the last saved one is sent instead. */
  keptName: string | null
}

/** Cut to `max` UTF-16 units (what zod counts) without splitting a surrogate pair. */
export function clip(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

type Notes = string[]

/** `obj` with each string field in `limits` cut to its limit; the same object when nothing was long. */
function clipFields<T extends object>(obj: T, limits: Record<string, number>, label: (field: string) => string, notes: Notes): T {
  let out: Record<string, unknown> | null = null
  for (const [field, max] of Object.entries(limits)) {
    const value = (obj as Record<string, unknown>)[field]
    if (typeof value === "string" && value.length > max) {
      out ??= { ...(obj as Record<string, unknown>) }
      out[field] = clip(value, max)
      notes.push(label(field))
    }
  }
  return (out as T | null) ?? obj
}

/** Short strings in a list: trimmed, empties dropped, each cut, the list capped. */
function stringList(list: readonly string[] | undefined, each: number, most: number): string[] | undefined {
  if (!list) return list
  const out = list.map((s) => clip(s.trim(), each)).filter((s) => s.length > 0).slice(0, most)
  return out.length === list.length && out.every((s, i) => s === list[i]) ? (list as string[]) : out
}

const validCoord = (lat: unknown, lng: unknown) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

const validMoney = (amount: unknown) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= MORE.money

const FIELD_WORDS: Record<string, string> = {
  title: "the title",
  notes: "the notes",
  journal: "the journal",
  city: "the city",
  emoji: "the emoji",
  confirmation: "the confirmation number",
  contact: "the contact",
  url: "the booking link",
  provider: "the provider",
  number: "the booking number",
  from: "the departure place",
  to: "the arrival place",
  seat: "the seat",
  terminal: "the terminal",
  type: "the booking type",
  endTimezone: "the arrival time zone",
  timezone: "the time zone",
  name: "the place name",
  address: "the address",
  placeId: "the place id",
  category: "the category",
  text: "the text",
  body: "a note",
}

const fieldWord = (field: string) => FIELD_WORDS[field] ?? `the ${field}`

/** A stop's name for a notice, cut short. */
const stopName = (item: ItineraryItem) => {
  const name = (item.title || item.location?.name || "").trim()
  return name ? `“${name.length > 40 ? `${clip(name, 39)}…` : name}”` : "a stop"
}

function cleanItem(item: ItineraryItem, where: string, notes: Notes): ItineraryItem {
  const of = (field: string) => `${fieldWord(field)} of ${stopName(item)}${where}`
  let out = clipFields(item, { title: LIMITS.itemTitle, notes: LIMITS.notes }, of, notes)
  const links = stringList(out.links, LIMITS.link, LIMITS.links)
  if (links !== out.links) out = { ...out, links }
  // A time the server can't read is dropped: it could never have been saved.
  if (out.time !== undefined && !CLOCK.test(out.time)) out = { ...out, time: undefined }
  if (out.endTime !== undefined && !CLOCK.test(out.endTime)) out = { ...out, endTime: undefined }
  if (out.location) {
    let location = clipFields(
      out.location,
      { name: LIMITS.locationName, address: LIMITS.address, placeId: MORE.placeId, category: MORE.category },
      of,
      notes,
    )
    if ((location.lat !== undefined || location.lng !== undefined) && !validCoord(location.lat, location.lng)) {
      location = { ...location, lat: undefined, lng: undefined }
    }
    if (location !== out.location) out = { ...out, location }
  }
  if (out.reservation) {
    let reservation = clipFields(
      out.reservation,
      {
        type: LIMITS.reservationType,
        confirmation: LIMITS.confirmation,
        contact: LIMITS.contact,
        url: LIMITS.reservationUrl,
        provider: LIMITS.provider,
        number: LIMITS.bookingNumber,
        from: LIMITS.bookingPlace,
        to: LIMITS.bookingPlace,
        seat: LIMITS.seat,
        terminal: LIMITS.terminal,
        endTimezone: MORE.timezone,
      },
      of,
      notes,
    )
    if (reservation.endDate !== undefined && !ISO_DATE.test(reservation.endDate)) reservation = { ...reservation, endDate: undefined }
    if (reservation !== out.reservation) out = { ...out, reservation }
  }
  if (out.cost && !(validMoney(out.cost.amount) && CURRENCY.test(out.cost.currency))) out = { ...out, cost: undefined }
  return out
}

function cleanItems(items: ItineraryItem[], where: string, notes: Notes): ItineraryItem[] {
  let changed = false
  const out = items.map((item) => {
    const next = cleanItem(item, where, notes)
    if (next !== item) changed = true
    return next
  })
  return changed ? out : items
}

function cleanDay(day: TripDay, n: number, notes: Notes): TripDay {
  const where = ` (day ${n})`
  let out = clipFields(
    day,
    { title: LIMITS.dayTitle, city: LIMITS.dayCity, notes: LIMITS.dayNotes, journal: LIMITS.journal, emoji: MORE.emoji, timezone: MORE.timezone },
    (field) => `day ${n}’s ${fieldWord(field).replace(/^the /, "")}`,
    notes,
  )
  const neighborhoods = stringList(out.neighborhoods, MORE.neighborhood, MORE.neighborhoods)
  if (neighborhoods !== out.neighborhoods) out = { ...out, neighborhoods }
  if (out.callouts) {
    let changed = out.callouts.length > MORE.callouts
    const callouts = out.callouts.slice(0, MORE.callouts).map((c) => {
      const next = clipFields(c, { body: LIMITS.calloutBody }, () => `a note on day ${n}`, notes)
      if (next !== c) changed = true
      return next
    })
    if (changed) out = { ...out, callouts }
  }
  const items = cleanItems(out.items, where, notes)
  return items === out.items ? out : { ...out, items }
}

function mapChanged<T>(list: T[] | undefined, fn: (entry: T, index: number) => T): T[] | undefined {
  if (!list) return list
  let changed = false
  const out = list.map((entry, i) => {
    const next = fn(entry, i)
    if (next !== entry) changed = true
    return next
  })
  return changed ? out : list
}

/**
 * `trip` brought inside what the server stores. `lastSaved` is the server's
 * copy the edits were made against: a blank name, time zone or list of
 * destinations falls back to it rather than being refused.
 */
export function sanitizeForSave(trip: Trip, lastSaved: Trip): Sanitized {
  const notes: Notes = []
  let out = trip
  let keptName: string | null = null
  const set = <K extends keyof Trip>(key: K, value: Trip[K]) => {
    if (value !== out[key]) out = { ...out, [key]: value }
  }

  if (!trip.name.trim()) {
    keptName = lastSaved.name.trim() ? lastSaved.name : "Untitled trip"
    set("name", keptName)
  } else if (trip.name.length > LIMITS.tripName) {
    set("name", clip(trip.name, LIMITS.tripName))
    notes.push("the trip name")
  }
  if (trip.description && trip.description.length > LIMITS.description) {
    set("description", clip(trip.description, LIMITS.description))
    notes.push("the trip description")
  }
  if (trip.slug !== undefined && (!SLUG.test(trip.slug) || RESERVED_SLUGS.has(trip.slug) || trip.slug.length > MORE.slug)) {
    set("slug", lastSaved.slug)
  }
  const destinations = stringList(trip.destinations, LIMITS.destination, LIMITS.destinations)!
  if (destinations.length < trip.destinations.filter((d) => d.trim()).length) notes.push(`the list of destinations (${LIMITS.destinations} at most)`)
  set("destinations", destinations.length > 0 ? destinations : lastSaved.destinations)
  if (!trip.timezone.trim()) set("timezone", lastSaved.timezone)
  else if (trip.timezone.length > MORE.timezone) set("timezone", lastSaved.timezone)
  set("tags", stringList(trip.tags, LIMITS.tag, LIMITS.tags)!)
  if (trip.center && !validCoord(trip.center.lat, trip.center.lng)) set("center", lastSaved.center)
  if (trip.budget && !(CURRENCY.test(trip.budget.currency) && (trip.budget.total === undefined || validMoney(trip.budget.total)))) {
    set("budget", lastSaved.budget)
  }
  if (trip.appearance) {
    set(
      "appearance",
      clipFields(trip.appearance, { eyebrow: MORE.eyebrow, subtitle: MORE.subtitle, headline: MORE.headline }, (f) => `the trip’s ${f}`, notes),
    )
  }

  set("days", mapChanged(trip.days, (day, i) => cleanDay(day, i + 1, notes))!)
  set("ideas", mapChanged(trip.ideas, (idea) => cleanItem(idea, " (ideas)", notes)))
  set(
    "party",
    mapChanged(trip.party, (person) => clipFields(person, { name: LIMITS.personName }, () => "a traveller’s name", notes)),
  )
  set(
    "checklist",
    mapChanged(trip.checklist, (entry) => clipFields(entry, { text: LIMITS.checklistText }, () => "a checklist item", notes)),
  )
  set(
    "expenses",
    mapChanged(trip.expenses, (expense) => {
      let next = clipFields(expense, { title: LIMITS.expenseTitle, notes: LIMITS.expenseNotes }, (f) => `${fieldWord(f)} of an expense`, notes)
      if (!validMoney(next.amount)) next = { ...next, amount: Number.isFinite(next.amount) ? Math.min(Math.max(next.amount, 0), MORE.money) : 0 }
      if (next.date !== undefined && !ISO_DATE.test(next.date)) next = { ...next, date: undefined }
      if (next.splitWith && next.splitWith.length > MORE.splitWith) next = { ...next, splitWith: next.splitWith.slice(0, MORE.splitWith) }
      return next
    }),
  )
  return { trip: out, shortened: notes, keptName }
}

/** One notice for what `sanitizeForSave` changed, or null when it changed nothing worth saying. */
export function describeSanitized({ shortened, keptName }: Pick<Sanitized, "shortened" | "keptName">): string | null {
  const parts: string[] = []
  if (keptName) parts.push(`A trip needs a name, so it stays “${keptName}” until you type a new one.`)
  if (shortened.length > 0) {
    const [first, second] = shortened
    const list =
      shortened.length === 1 ? first : shortened.length === 2 ? `${first} and ${second}` : `${first}, ${second} and ${shortened.length - 2} more`
    parts.push(`Some text was longer than a trip can hold, so the end was cut from ${list}.`)
  }
  return parts.length > 0 ? parts.join(" ") : null
}
