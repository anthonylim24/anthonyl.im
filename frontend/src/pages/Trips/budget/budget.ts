import { LIMITS } from "../limits"
import type { ExpenseCategory, ItineraryItem, Trip, TripExpense, TripPerson } from "../types"

// Budget maths for a trip: money formatting, the destination's currency, the
// planned (stop costs) and spent (expenses) totals in one currency, and who
// owes whom. Pure: no React, no I/O. Exchange rates come in as data from
// `rates.ts`.
//
// Rates convention: `Rates[code]` is how many units of `code` one unit of the
// budget currency buys (the budget currency is the base). With a euro budget,
// ¥160 per €1 is `{ JPY: 160 }`, and ¥3,200 counts as €20.

export type Rates = Readonly<Record<string, number>>

// ── Limits (mirror server/src/trips/types.ts, so a save is never rejected) ──

export const MAX_AMOUNT = 1_000_000_000
export const TITLE_MAX = LIMITS.expenseTitle
export const NAME_MAX = LIMITS.personName
/** Characters an amount field takes: "1,000,000,000.00" with room for a symbol and spaces. */
export const AMOUNT_TEXT_MAX = 24
const ID_MAX = 64
const NOTES_MAX = LIMITS.expenseNotes
const SPLIT_MAX = 50
const CODE = /^[A-Z]{3}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isCurrencyCode = (code: string): boolean => CODE.test(code)

// ── Currencies ───────────────────────────────────────────────────────────

export interface CurrencyInfo {
  code: string
  name: string
}

/** The currencies offered in pickers, roughly by how often travellers meet them. */
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KRW", name: "South Korean won" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "TWD", name: "New Taiwan dollar" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "THB", name: "Thai baht" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "PHP", name: "Philippine peso" },
  { code: "INR", name: "Indian rupee" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "MXN", name: "Mexican peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "ISK", name: "Icelandic króna" },
  { code: "PLN", name: "Polish złoty" },
  { code: "CZK", name: "Czech koruna" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "TRY", name: "Turkish lira" },
  { code: "AED", name: "UAE dirham" },
  { code: "ILS", name: "Israeli shekel" },
  { code: "ZAR", name: "South African rand" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "MAD", name: "Moroccan dirham" },
]

/** `CURRENCIES`, plus any code a trip already uses that the list lacks (so a picker can show it). */
export function currencyChoices(...inUse: Array<string | undefined>): CurrencyInfo[] {
  const known = new Set(CURRENCIES.map((c) => c.code))
  const extra = [...new Set(inUse)]
    .filter((code): code is string => !!code && isCurrencyCode(code) && !known.has(code))
    .sort()
    .map((code) => ({ code, name: code }))
  return [...CURRENCIES, ...extra]
}

// Currencies whose prices carry no minor unit in practice, whatever ISO 4217
// or this browser's ICU says (ICU has disagreed on IDR and HUF across versions).
const ZERO_DECIMAL = new Set([
  "JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF", "TWD", "UGX", "PYG", "XOF", "XAF", "XPF", "RWF", "KMF", "GNF", "BIF", "DJF", "VUV",
])
const digitsCache = new Map<string, number>()

/** Digits after the decimal point for `currency` (0 for yen, 2 for euros, 3 for dinars). */
export function minorDigits(currency: string): number {
  const code = currency.toUpperCase()
  if (ZERO_DECIMAL.has(code)) return 0
  let digits = digitsCache.get(code)
  if (digits === undefined) {
    try {
      const resolved = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions()
      digits = Math.min(3, resolved.maximumFractionDigits ?? 2)
    } catch {
      // Not a code Intl accepts: treat it like most currencies.
      digits = 2
    }
    digitsCache.set(code, digits)
  }
  return digits
}

/** Round to the currency's minor unit (cents, or whole yen). */
export function roundMinor(amount: number, currency: string): number {
  const scale = 10 ** minorDigits(currency)
  return Math.round(amount * scale) / scale
}

// ── Formatting ───────────────────────────────────────────────────────────

export interface MoneyFormat {
  /** Shorten large figures ("€12K", "₩1.2M"); amounts under 10,000 stay exact. */
  compact?: boolean
  locale?: string
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let found = formatters.get(key)
  if (!found) {
    found = new Intl.NumberFormat(locale, options)
    formatters.set(key, found)
  }
  return found
}

/**
 * "€1,200", "€12.50", "₩42,000", "¥3,200". Whole amounts drop the decimals;
 * anything with cents shows both digits. Never throws.
 */
export function formatMoney(amount: number, currency: string, opts: MoneyFormat = {}): string {
  const code = currency.toUpperCase()
  const digits = minorDigits(code)
  const value = roundMinor(Number.isFinite(amount) ? amount : 0, code)
  const locale = opts.locale ?? "en-US"
  const compact = opts.compact === true && Math.abs(value) >= 10_000
  const whole = Number.isInteger(value)
  try {
    return formatter(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      ...(compact
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: digits }),
    }).format(value)
  } catch {
    // A code Intl rejects still reads as money.
    return `${value.toFixed(whole ? 0 : digits)} ${code}`
  }
}

/** The amount as an editable string, without a symbol: "1,200.50", "42,000". */
export function formatAmountInput(amount: number, currency: string): string {
  const digits = minorDigits(currency)
  const value = roundMinor(amount, currency)
  return formatter("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/**
 * Read a typed amount the way people write them: "1,200.50", "1.200,50",
 * "1200,5", "€12", "1 200". The last separator followed by one or two digits
 * is the decimal point; a lone "," or (for whole-unit currencies such as KRW)
 * a lone "." followed by exactly three digits groups thousands. Returns the
 * amount rounded to the currency's minor unit, or null when it isn't one
 * (empty, negative, malformed, or over the limit).
 */
export function parseAmount(text: string, currency = "USD"): number | null {
  const raw = text.replace(/[\s\u00a0\u202f'’]/g, "")
  if (!raw || raw.includes("-")) return null
  const cleaned = raw.replace(/[^\d.,]/g, "")
  if (!/\d/.test(cleaned)) return null
  const commas = cleaned.split(",").length - 1
  const dots = cleaned.split(".").length - 1
  const last = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."))
  let decimal: "," | "." | null = null
  if (commas > 0 && dots > 0) decimal = cleaned[last] as "," | "."
  else if (commas + dots === 1) {
    const sep = cleaned[last] as "," | "."
    const tail = cleaned.length - last - 1
    const groups = tail === 3 && (sep === "," || minorDigits(currency) === 0)
    decimal = groups ? null : sep
  }
  const group = decimal === "," ? "." : decimal === "." ? "," : commas > 0 ? "," : "."
  const parts = decimal ? cleaned.split(decimal) : [cleaned]
  if (parts.length > 2) return null
  const [intPart = "", fracPart = ""] = parts
  if (fracPart.includes(group)) return null
  const groups = intPart.split(group)
  if (groups.length > 1 && (groups[0] === "" || groups.slice(1).some((g) => g.length !== 3))) return null
  const value = Number(`${groups.join("") || "0"}.${fracPart}`)
  if (!Number.isFinite(value) || value > MAX_AMOUNT) return null
  return roundMinor(value, currency)
}

// ── The destination's currency ───────────────────────────────────────────

const ZONE_CURRENCY: Record<string, string> = {
  "Asia/Seoul": "KRW",
  "Asia/Tokyo": "JPY",
  "Asia/Shanghai": "CNY",
  "Asia/Chongqing": "CNY",
  "Asia/Urumqi": "CNY",
  "Asia/Hong_Kong": "HKD",
  "Asia/Taipei": "TWD",
  "Asia/Singapore": "SGD",
  "Asia/Bangkok": "THB",
  "Asia/Ho_Chi_Minh": "VND",
  "Asia/Saigon": "VND",
  "Asia/Jakarta": "IDR",
  "Asia/Makassar": "IDR",
  "Asia/Jayapura": "IDR",
  "Asia/Kuala_Lumpur": "MYR",
  "Asia/Kuching": "MYR",
  "Asia/Manila": "PHP",
  "Asia/Kolkata": "INR",
  "Asia/Calcutta": "INR",
  "Asia/Dubai": "AED",
  "Asia/Jerusalem": "ILS",
  "Asia/Tel_Aviv": "ILS",
  "Asia/Nicosia": "EUR",
  "Europe/London": "GBP",
  "Europe/Belfast": "GBP",
  "Europe/Zurich": "CHF",
  "Europe/Stockholm": "SEK",
  "Europe/Oslo": "NOK",
  "Europe/Copenhagen": "DKK",
  "Europe/Warsaw": "PLN",
  "Europe/Prague": "CZK",
  "Europe/Budapest": "HUF",
  "Europe/Istanbul": "TRY",
  "Atlantic/Reykjavik": "ISK",
  "Atlantic/Madeira": "EUR",
  "Atlantic/Azores": "EUR",
  "Atlantic/Canary": "EUR",
  "Africa/Johannesburg": "ZAR",
  "Africa/Cairo": "EGP",
  "Africa/Casablanca": "MAD",
  "Pacific/Auckland": "NZD",
  "Pacific/Honolulu": "USD",
  "America/New_York": "USD",
  "America/Chicago": "USD",
  "America/Denver": "USD",
  "America/Phoenix": "USD",
  "America/Los_Angeles": "USD",
  "America/Anchorage": "USD",
  "America/Detroit": "USD",
  "America/Puerto_Rico": "USD",
  "America/Toronto": "CAD",
  "America/Montreal": "CAD",
  "America/Vancouver": "CAD",
  "America/Edmonton": "CAD",
  "America/Winnipeg": "CAD",
  "America/Halifax": "CAD",
  "America/St_Johns": "CAD",
  "America/Mexico_City": "MXN",
  "America/Cancun": "MXN",
  "America/Tijuana": "MXN",
  "America/Monterrey": "MXN",
  "America/Sao_Paulo": "BRL",
}

const EURO_CITIES = new Set([
  "Amsterdam", "Andorra", "Athens", "Berlin", "Bratislava", "Brussels", "Busingen", "Dublin", "Helsinki", "Lisbon",
  "Ljubljana", "Luxembourg", "Madrid", "Malta", "Monaco", "Nicosia", "Paris", "Podgorica", "Riga", "Rome",
  "San_Marino", "Tallinn", "Vatican", "Vienna", "Vilnius", "Zagreb",
])

// Destinations are free text ("Tokyo", "Lisbon, Portugal"). First match wins,
// so the United States comes before Mexico ("New Mexico").
const PLACE_CURRENCY: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(united states|usa|new york|nyc|new mexico|los angeles|san francisco|chicago|las vegas|miami|boston|seattle|hawaii)\b/i, "USD"],
  [/\b(japan|tokyo|kyoto|osaka|nara|hiroshima|fukuoka|sapporo|hokkaido|okinawa)\b/i, "JPY"],
  [/\b(korea|seoul|busan|jeju|gyeongju)\b/i, "KRW"],
  [/\b(hong kong)\b/i, "HKD"],
  [/\b(taiwan|taipei)\b/i, "TWD"],
  [/\b(china|beijing|shanghai|chengdu|xi'?an)\b/i, "CNY"],
  [/\b(thailand|bangkok|phuket|chiang mai)\b/i, "THB"],
  [/\b(vietnam|viet nam|hanoi|ho chi minh|saigon|da nang|hoi an)\b/i, "VND"],
  [/\b(indonesia|bali|jakarta|ubud)\b/i, "IDR"],
  [/\b(singapore)\b/i, "SGD"],
  [/\b(malaysia|kuala lumpur|penang)\b/i, "MYR"],
  [/\b(philippines|manila|cebu)\b/i, "PHP"],
  [/\b(india|delhi|mumbai|goa|jaipur)\b/i, "INR"],
  [/\b(united kingdom|uk|england|scotland|wales|london|edinburgh)\b/i, "GBP"],
  [/\b(switzerland|zurich|zürich|geneva|lucerne|zermatt)\b/i, "CHF"],
  [/\b(iceland|reykjavik)\b/i, "ISK"],
  [
    /\b(france|paris|nice|spain|madrid|barcelona|seville|italy|rome|florence|venice|milan|naples|portugal|lisbon|porto|germany|berlin|munich|netherlands|amsterdam|greece|athens|santorini|ireland|dublin|austria|vienna|belgium|brussels|finland|helsinki|croatia|dubrovnik)\b/i,
    "EUR",
  ],
  [/\b(mexico|cancun|cancún|tulum|oaxaca)\b/i, "MXN"],
  [/\b(canada|toronto|vancouver|montreal|banff)\b/i, "CAD"],
  [/\b(australia|sydney|melbourne)\b/i, "AUD"],
  [/\b(new zealand|auckland|queenstown)\b/i, "NZD"],
  [/\b(dubai|abu dhabi|emirates)\b/i, "AED"],
  [/\b(turkey|türkiye|istanbul)\b/i, "TRY"],
  [/\b(morocco|marrakech|marrakesh|fes)\b/i, "MAD"],
  [/\b(south africa|cape town)\b/i, "ZAR"],
  [/\b(brazil|rio de janeiro|são paulo|sao paulo)\b/i, "BRL"],
]

/** The currency spent on the ground there, from the time zone, then the destinations; null when unsure. */
export function localCurrency(trip: Pick<Trip, "timezone" | "destinations">): string | null {
  const zone = trip.timezone ?? ""
  const exact = ZONE_CURRENCY[zone]
  if (exact) return exact
  if (zone.startsWith("Europe/") && EURO_CITIES.has(zone.slice("Europe/".length))) return "EUR"
  if (zone.startsWith("Australia/")) return "AUD"
  for (const destination of trip.destinations ?? []) {
    const hit = PLACE_CURRENCY.find(([pattern]) => pattern.test(destination))
    if (hit) return hit[1]
  }
  return null
}

/** The currency every total is shown in: the budget's when set, else the destination's, else USD. */
export function defaultCurrency(trip: Pick<Trip, "budget" | "timezone" | "destinations">): string {
  const set = trip.budget?.currency
  if (set && isCurrencyCode(set)) return set
  return localCurrency(trip) ?? "USD"
}

// ── Categories ───────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["lodging", "transport", "food", "activities", "shopping", "other"]

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  lodging: "Lodging",
  transport: "Transport",
  food: "Food & drink",
  activities: "Activities",
  shopping: "Shopping",
  other: "Other",
}

const TRANSPORT_TYPES = new Set(["flight", "train", "transit", "car", "bus", "ferry"])
const FOOD_TYPES = new Set(["meal", "food", "restaurant", "cafe", "coffee", "bar", "pub", "bakery", "dessert", "brewery", "winery", "street_food", "food_market"])

/** Which budget line a stop's cost belongs to. */
export function costCategory(item: Pick<ItineraryItem, "reservation" | "location">): ExpenseCategory {
  const type = item.reservation?.type ?? ""
  const category = item.location?.category ?? ""
  if (type === "hotel" || category === "hotel") return "lodging"
  if (TRANSPORT_TYPES.has(type) || category === "transit") return "transport"
  if (FOOD_TYPES.has(type) || FOOD_TYPES.has(category)) return "food"
  if (category === "shopping") return "shopping"
  return "activities"
}

// ── Totals ───────────────────────────────────────────────────────────────

/** `amount` of `from` in `to`, or null when there is no rate for `from`. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return amount
  const rate = rates[from]
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? amount / rate : null
}

/** Currencies the trip's costs and expenses use other than `base`, sorted. */
export function foreignCurrencies(trip: Pick<Trip, "days" | "expenses">, base: string): string[] {
  const found = new Set<string>()
  for (const day of trip.days) for (const item of day.items) if (item.cost) found.add(item.cost.currency)
  for (const expense of trip.expenses ?? []) found.add(expense.currency)
  found.delete(base)
  return [...found].sort()
}

export interface CategoryTotal {
  category: ExpenseCategory
  planned: number
  spent: number
}

export interface DayTotal {
  dayId: string
  planned: number
  spent: number
}

export interface BudgetSummary {
  /** The currency every figure here is in. */
  currency: string
  /** The budget, when one is set. */
  total?: number
  /** Every stop's cost. */
  planned: number
  /** Every expense. */
  spent: number
  /** Stop costs no expense has been logged against yet: planned money still to spend. */
  outstanding: number
  /** `total − spent − outstanding`: negative when the trip is over budget. Absent without a budget. */
  remaining?: number
  /** Categories with any money in them, in `EXPENSE_CATEGORIES` order. */
  byCategory: CategoryTotal[]
  /** Every day, in trip order. An expense counts on its stop's day, else on its date. */
  byDay: DayTotal[]
  /** Currencies with amounts but no rate: those amounts are left out of every figure. */
  unconverted: string[]
}

export function budgetSummary(trip: Trip, rates: Rates = {}): BudgetSummary {
  const currency = defaultCurrency(trip)
  const unconverted = new Set<string>()
  const inBudget = (amount: number, from: string): number | null => {
    const value = convert(amount, from, currency, rates)
    if (value === null) unconverted.add(from)
    return value
  }
  const expenses = trip.expenses ?? []
  const paidFor = new Set(expenses.map((e) => e.itemId).filter((id): id is string => !!id))
  const categories = new Map<ExpenseCategory, CategoryTotal>()
  const line = (category: ExpenseCategory) => {
    let found = categories.get(category)
    if (!found) {
      found = { category, planned: 0, spent: 0 }
      categories.set(category, found)
    }
    return found
  }
  const byDay: DayTotal[] = trip.days.map((day) => ({ dayId: day.id, planned: 0, spent: 0 }))
  const dayOfItem = new Map<string, DayTotal>()
  const dayOfDate = new Map<string, DayTotal>()
  let planned = 0
  let outstanding = 0
  let spent = 0

  trip.days.forEach((day, index) => {
    const total = byDay[index]
    if (!dayOfDate.has(day.date)) dayOfDate.set(day.date, total)
    for (const item of day.items) {
      dayOfItem.set(item.id, total)
      if (!item.cost) continue
      const value = inBudget(item.cost.amount, item.cost.currency)
      if (value === null) continue
      planned += value
      if (!paidFor.has(item.id)) outstanding += value
      line(costCategory(item)).planned += value
      total.planned += value
    }
  })
  for (const expense of expenses) {
    const value = inBudget(expense.amount, expense.currency)
    if (value === null) continue
    spent += value
    line(expense.category).spent += value
    const day = (expense.itemId && dayOfItem.get(expense.itemId)) || (expense.date && dayOfDate.get(expense.date)) || null
    if (day) day.spent += value
  }

  const round = (value: number) => roundMinor(value, currency)
  const limit = trip.budget?.total
  const total = typeof limit === "number" && Number.isFinite(limit) && limit >= 0 ? limit : undefined
  return {
    currency,
    ...(total !== undefined ? { total, remaining: round(total - spent - outstanding) } : {}),
    planned: round(planned),
    spent: round(spent),
    outstanding: round(outstanding),
    byCategory: EXPENSE_CATEGORIES.flatMap((category) => {
      const found = categories.get(category)
      return found ? [{ category, planned: round(found.planned), spent: round(found.spent) }] : []
    }),
    byDay: byDay.map((day) => ({ ...day, planned: round(day.planned), spent: round(day.spent) })),
    unconverted: [...unconverted].sort(),
  }
}

// ── People ───────────────────────────────────────────────────────────────

export interface Viewer {
  id: string | null
  name: string | null
}

/** A member's person id: stable, so expenses keep pointing at them once the party is saved. */
export const memberPersonId = (userId: string): string => `u-${userId}`.slice(0, ID_MAX)

/**
 * Who is on the trip: `trip.party` once it is saved, else the owner and the
 * collaborators. Names are what gets stored, never "You" (that depends on who
 * is looking; see `personLabel`).
 */
export function peopleFor(trip: Pick<Trip, "party" | "ownerId" | "collaborators">, viewer: Viewer): TripPerson[] {
  if (trip.party) return trip.party
  const member = (userId: string, stored: string | undefined, fallback: string): TripPerson => {
    const own = viewer.id !== null && viewer.id === userId ? viewer.name?.trim() : undefined
    const name = (stored?.trim() || own || fallback).slice(0, NAME_MAX)
    return { id: memberPersonId(userId), name, userId }
  }
  const people = [member(trip.ownerId, undefined, "Trip owner")]
  const seen = new Set([trip.ownerId])
  for (const collaborator of trip.collaborators) {
    if (seen.has(collaborator.userId)) continue
    seen.add(collaborator.userId)
    people.push(member(collaborator.userId, collaborator.name, `Traveller ${people.length + 1}`))
  }
  return people
}

/** Members (owner, collaborators) not in a saved party yet: someone who joined after it was written. */
export function missingMembers(trip: Pick<Trip, "party" | "ownerId" | "collaborators">, viewer: Viewer): TripPerson[] {
  if (!trip.party) return []
  const present = new Set(trip.party.map((p) => p.userId).filter(Boolean))
  return peopleFor({ ...trip, party: undefined }, viewer).filter((p) => p.userId && !present.has(p.userId))
}

/** What to call someone on screen: "You" for the viewer, else their name. */
export function personLabel(person: TripPerson, viewer: Viewer): string {
  if (viewer.id !== null && person.userId === viewer.id) return "You"
  return person.name.trim() || "Someone"
}

// ── Splitting ────────────────────────────────────────────────────────────

export interface Balance {
  personId: string
  /** What they paid for the group, in the budget currency. */
  paid: number
  /** Their share of what was paid. */
  share: number
  /** `paid − share`: positive when they are owed. */
  net: number
}

/**
 * Who paid what and who owes what, in the budget currency. Counts only
 * expenses that name a payer on the trip and convert; `splitWith` names who
 * shares it equally, and empty (or naming no one still on the trip) means everyone.
 */
export function balances(trip: Trip, rates: Rates, people: readonly TripPerson[]): Balance[] {
  const currency = defaultCurrency(trip)
  const rows = new Map(people.map((p) => [p.id, { personId: p.id, paid: 0, share: 0 }]))
  const everyone = [...rows.keys()]
  for (const expense of trip.expenses ?? []) {
    const payer = expense.paidBy ? rows.get(expense.paidBy) : undefined
    if (!payer) continue
    const value = convert(expense.amount, expense.currency, currency, rates)
    if (value === null || value <= 0) continue
    const named = [...new Set(expense.splitWith ?? [])].filter((id) => rows.has(id))
    const sharers = named.length > 0 ? named : everyone
    payer.paid += value
    for (const id of sharers) {
      const row = rows.get(id)
      if (row) row.share += value / sharers.length
    }
  }
  return [...rows.values()].map((row) => ({ ...row, net: row.paid - row.share }))
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

/** Balances (people not yet square) up to this many are settled in the fewest transfers; 2^n subsets are weighed. */
const EXACT_SETTLE = 12

interface Units {
  id: string
  /** Net in the currency's minor units: positive when owed. */
  units: number
}

const byId = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)

/**
 * Settle the balances in as few transfers as possible. Everyone square can be
 * split into groups that each settle among themselves; a group of k people
 * needs k − 1 transfers, so the fewest transfers come from the most groups
 * (Ann owed 6 by Bo and Cy, 3 each, and Di owed 4 by Ed: three transfers,
 * where paying the largest debt first would take four). Up to `EXACT_SETTLE`
 * open balances the grouping is exact; past that, one group. Inside a group
 * the largest debtor pays the largest creditor until it is square.
 *
 * Works in the currency's minor units, so no transfer is under one cent (or
 * one won), and the rounding remainder is absorbed by the largest balance.
 */
export function settleUp(list: readonly Balance[], currency: string): Transfer[] {
  const scale = 10 ** minorDigits(currency)
  const entries: Units[] = list.map((b) => ({ id: b.personId, units: Math.round(b.net * scale) }))
  const drift = entries.reduce((sum, e) => sum + e.units, 0)
  if (drift !== 0 && entries.length > 0) {
    const largest = [...entries].sort((x, y) => Math.abs(y.units) - Math.abs(x.units) || byId(x, y))[0]
    largest.units -= drift
  }
  const open = entries.filter((e) => e.units !== 0)
  const groups = open.length <= EXACT_SETTLE ? zeroSumGroups(open) : [open]
  const peak = (group: readonly Units[]) => [...group].sort((x, y) => Math.abs(y.units) - Math.abs(x.units) || byId(x, y))[0]
  groups.sort((x, y) => Math.abs(peak(y).units) - Math.abs(peak(x).units) || byId(peak(x), peak(y)))
  return groups.flatMap((group) => largestFirstTransfers(group, scale))
}

/**
 * The most groups that each sum to zero, splitting `entries` (which sum to
 * zero). best[mask] is the most zero-sum groups the people in `mask` can be
 * peeled into, one person at a time; each time what is left sums to zero, a
 * group has closed (the "optimal account balancing" subset recurrence).
 */
function zeroSumGroups(entries: readonly Units[]): Units[][] {
  const n = entries.length
  if (n === 0) return []
  const full = (1 << n) - 1
  // Float64: minor units of a large trip in won can pass 2^31; integers stay exact to 2^53.
  const sum = new Float64Array(full + 1)
  const best = new Uint8Array(full + 1)
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask
    sum[mask] = sum[mask ^ low] + entries[31 - Math.clz32(low)].units
    let most = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) most = Math.max(most, best[mask ^ (1 << i)])
    best[mask] = most + (sum[mask] === 0 ? 1 : 0)
  }
  const groups: Units[][] = []
  let mask = full
  let start = full
  while (mask !== 0) {
    const closes = sum[mask] === 0 ? 1 : 0
    let i = 0
    while (i < n && (!(mask & (1 << i)) || best[mask ^ (1 << i)] !== best[mask] - closes)) i++
    if (i === n) return [[...entries]] // unreachable: some person always lies on a best path
    mask ^= 1 << i
    if (sum[mask] === 0) {
      groups.push(entries.filter((_, j) => (start ^ mask) & (1 << j)))
      start = mask
    }
  }
  return groups
}

/** Square one group: the largest debtor pays the largest creditor, again and again. */
function largestFirstTransfers(group: readonly Units[], scale: number): Transfer[] {
  let debtors = group.filter((e) => e.units < 0).map((e) => ({ id: e.id, units: -e.units }))
  let creditors = group.filter((e) => e.units > 0).map((e) => ({ ...e }))
  const largestFirst = (x: Units, y: Units) => y.units - x.units || byId(x, y)
  const transfers: Transfer[] = []
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(largestFirst)
    creditors.sort(largestFirst)
    const debtor = debtors[0]
    const creditor = creditors[0]
    const units = Math.min(debtor.units, creditor.units)
    transfers.push({ from: debtor.id, to: creditor.id, amount: units / scale })
    debtor.units -= units
    creditor.units -= units
    debtors = debtors.filter((e) => e.units > 0)
    creditors = creditors.filter((e) => e.units > 0)
  }
  return transfers
}

// ── Lists ────────────────────────────────────────────────────────────────

export interface ExpenseGroup {
  /** ISO date, or null for expenses without one. */
  date: string | null
  expenses: TripExpense[]
}

/** Expenses by the day they were spent: newest day first, undated last; newest first within a day. */
export function expenseGroups(expenses: readonly TripExpense[]): ExpenseGroup[] {
  const groups = new Map<string | null, TripExpense[]>()
  for (const expense of expenses) {
    const key = expense.date ?? null
    const list = groups.get(key) ?? []
    list.push(expense)
    groups.set(key, list)
  }
  const newestFirst = (x: TripExpense, y: TripExpense) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0)
  return [...groups.entries()]
    .sort(([x], [y]) => (x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? 1 : -1))
    .map(([date, list]) => ({ date, expenses: list.sort(newestFirst) }))
}

/** Put `entry` back at `index` (Undo), unless it is already there. */
export function restoreAt<T extends { id: string }>(list: readonly T[], entry: T, index: number): T[] {
  if (list.some((existing) => existing.id === entry.id)) return [...list]
  const next = [...list]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, entry)
  return next
}

// ── New records ──────────────────────────────────────────────────────────

const shortId = () => crypto.randomUUID().slice(0, 8)

export type ExpenseDraft = Pick<TripExpense, "title" | "amount" | "currency" | "category"> &
  Partial<Pick<TripExpense, "date" | "itemId" | "paidBy" | "splitWith" | "notes">>

/**
 * Bring an expense inside the server's limits: amount clamped and rounded,
 * code upper-cased, strings trimmed and bounded, empty optionals dropped.
 * A malformed currency code falls back to USD rather than failing every save.
 */
export function cleanExpense(expense: TripExpense): TripExpense {
  const code = expense.currency.trim().toUpperCase()
  const currency = isCurrencyCode(code) ? code : "USD"
  const amount = Number.isFinite(expense.amount) ? Math.min(MAX_AMOUNT, Math.max(0, expense.amount)) : 0
  const split = [...new Set((expense.splitWith ?? []).filter(Boolean).map((id) => id.slice(0, ID_MAX)))].slice(0, SPLIT_MAX)
  const notes = expense.notes?.trim().slice(0, NOTES_MAX)
  return {
    id: expense.id.slice(0, ID_MAX),
    title: expense.title.trim().slice(0, TITLE_MAX),
    amount: roundMinor(amount, currency),
    currency,
    category: EXPENSE_CATEGORIES.includes(expense.category) ? expense.category : "other",
    ...(expense.date && ISO_DATE.test(expense.date) ? { date: expense.date } : {}),
    ...(expense.itemId ? { itemId: expense.itemId.slice(0, ID_MAX) } : {}),
    ...(expense.paidBy ? { paidBy: expense.paidBy.slice(0, ID_MAX) } : {}),
    ...(split.length > 0 ? { splitWith: split } : {}),
    ...(notes ? { notes } : {}),
    createdAt: expense.createdAt,
  }
}

export function newExpense(draft: ExpenseDraft, now: Date = new Date()): TripExpense {
  return cleanExpense({ ...draft, id: `ex-${shortId()}`, createdAt: now.toISOString() })
}

export function newPerson(name: string): TripPerson {
  return { id: `p-${shortId()}`, name: name.trim().slice(0, NAME_MAX) }
}
