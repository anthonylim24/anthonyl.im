// The concierge's own tools: what the model can look up (real venues, real
// routes) and what it can propose (changes to the itinerary). Everything here
// is deterministic and testable; chat.ts runs the model loop around it.
//
// Nothing in this file edits a trip. `propose_changes` validates a batch
// against the itinerary and hands the client a resolved proposal; the
// traveller applies it (and can undo it) in the UI.

import { haversineMeters } from "../data/koreaPlaces"
import type { PlaceGeocoder } from "../geminiGrounding"
import { weekday } from "./signals"
import type { ItineraryItem, Trip, TripDay } from "./types"

// ── Shared shapes ────────────────────────────────────────────────────────

export interface LatLng {
  lat: number
  lng: number
}

/** A venue card. `ref` is the Google place id when there is one; the model
 *  uses it to point at a place it found earlier ("the second one"). */
export interface ConciergeCardPlace {
  ref: string
  name: string
  address?: string
  lat?: number
  lng?: number
  category?: string
  placeId?: string
  mapsUrl?: string
  notes?: string
  /** Suggested slot, when the question implied one. */
  dayId?: string
  time?: string
  rating?: number
  ratingCount?: number
  /** "€" … "€€€€". */
  price?: string
  /** Opening hours on the day in question, 24h: "09:00–18:00", "Closed". */
  hours?: string
  /** Weekday the hours line is for, e.g. "Sat". */
  hoursDay?: string
  /** Open at the suggested day and time (or right now). */
  open?: boolean
  /** Straight-line walk estimate from the stop the search was anchored to. */
  walk?: { from: string; minutes: number; meters: number }
}

export type ProposalChange =
  | { id: string; op: "add"; dayId: string; time?: string; endTime?: string; notes?: string; place: ConciergeCardPlace }
  | { id: string; op: "set_time"; dayId: string; itemId: string; title: string; from?: string; time: string; endTime?: string }
  | { id: string; op: "move"; itemId: string; title: string; fromDayId: string; toDayId: string; time?: string }
  | { id: string; op: "remove"; dayId: string; itemId: string; title: string }
  | { id: string; op: "reorder"; dayId: string; order: string[]; titles: string[] }

export interface ConciergeProposal {
  id: string
  summary: string
  changes: ProposalChange[]
}

// ── Small pure helpers ───────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const WALK_DETOUR = 1.3
const WALK_M_PER_MIN = 80

export function normaliseTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const m = value.trim().match(/^(\d{1,2})[:.h](\d{2})$/)
  if (!m) return undefined
  const time = `${m[1]!.padStart(2, "0")}:${m[2]}`
  return TIME_RE.test(time) ? time : undefined
}

const clockMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Walking estimate between two points: straight line plus a street detour. */
export function walkEstimate(a: LatLng, b: LatLng): { minutes: number; meters: number } {
  const meters = Math.round((haversineMeters(a, b) * WALK_DETOUR) / 10) * 10
  return { meters, minutes: Math.max(1, Math.round(meters / WALK_M_PER_MIN)) }
}

export function describeWalk(a: LatLng, b: LatLng): string {
  const { minutes, meters } = walkEstimate(a, b)
  const distance = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`
  return meters > 2500 ? `${distance} (about ${minutes} min on foot: take a ride)` : `${distance}, about ${minutes} min walk`
}

export function itemPoint(item: ItineraryItem | undefined): LatLng | null {
  const lat = item?.location?.lat
  const lng = item?.location?.lng
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/** Same venue under two spellings ("Restaurant - Cervejaria Ramiro"). */
export function sameVenue(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  // Whole words only: "Bloco" is not "Blocos Bar".
  return short.length >= 5 && ` ${long} `.includes(` ${short} `)
}

export function findItem(trip: Trip, idOrTitle: unknown, dayId?: string): { day: TripDay; item: ItineraryItem } | null {
  if (typeof idOrTitle !== "string" || !idOrTitle.trim()) return null
  const key = idOrTitle.trim().replace(/^#/, "")
  const days = dayId ? [...trip.days.filter((d) => d.id === dayId), ...trip.days.filter((d) => d.id !== dayId)] : trip.days
  for (const day of days) {
    const item = day.items.find((i) => i.id === key)
    if (item) return { day, item }
  }
  for (const day of days) {
    const item = day.items.find((i) => sameVenue(i.title, key) || (i.location?.name ? sameVenue(i.location.name, key) : false))
    if (item) return { day, item }
  }
  return null
}

/** Where on the trip a venue already is, if anywhere. */
export function onTrip(trip: Trip, name: string, placeId?: string): { day: TripDay; item: ItineraryItem; index: number } | null {
  for (const [index, day] of trip.days.entries()) {
    for (const item of day.items) {
      if (placeId && item.location?.placeId === placeId) return { day, item, index }
      if (sameVenue(item.title, name) || (item.location?.name && sameVenue(item.location.name, name))) return { day, item, index }
    }
  }
  return null
}

/** UTC instant for a wall-clock date and time in an IANA zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const guess = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
    const shown = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`)
    return new Date(guess.getTime() - (shown - guess.getTime()))
  } catch {
    return guess
  }
}

// ── Google Places (Text Search, New) ─────────────────────────────────────

interface PlacesPeriodPoint {
  day?: number
  hour?: number
  minute?: number
}

export interface RawPlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  shortFormattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  primaryType?: string
  types?: string[]
  businessStatus?: string
  googleMapsUri?: string
  editorialSummary?: { text?: string }
  regularOpeningHours?: { periods?: Array<{ open?: PlacesPeriodPoint; close?: PlacesPeriodPoint }> }
}

export type PlacesSearch = (args: {
  query: string
  center?: LatLng | null
  radiusMeters?: number
  limit?: number
  signal?: AbortSignal
}) => Promise<RawPlace[]>

const PLACES_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "primaryType",
  "types",
  "businessStatus",
  "googleMapsUri",
  "editorialSummary",
  "regularOpeningHours.periods",
]
  .map((f) => `places.${f}`)
  .join(",")

export function createGooglePlacesSearch(apiKey: string, fetchImpl: typeof fetch = fetch): PlacesSearch {
  return async ({ query, center, radiusMeters = 1500, limit = 6, signal }) => {
    const body: Record<string, unknown> = { textQuery: query, pageSize: Math.min(Math.max(limit, 1), 10), languageCode: "en" }
    if (center) {
      body.locationBias = {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Math.min(Math.max(radiusMeters, 200), 50_000),
        },
      }
    }
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_FIELDS },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`places search ${res.status}`)
    const json = (await res.json()) as { places?: RawPlace[] }
    return json.places ?? []
  }
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const pad = (n: number | undefined) => String(n ?? 0).padStart(2, "0")

/** Opening hours on one weekday (0 = Sunday), 24h. `undefined` = unknown. */
export function hoursOn(place: RawPlace, day: number): string | undefined {
  const periods = place.regularOpeningHours?.periods
  if (!periods) return undefined
  if (periods.length === 1 && !periods[0]!.close) return "Open 24 hours"
  const spans = periods
    .filter((p) => p.open?.day === day)
    .sort((a, b) => (a.open?.hour ?? 0) - (b.open?.hour ?? 0))
    .map((p) => `${pad(p.open?.hour)}:${pad(p.open?.minute)}–${p.close ? `${pad(p.close.hour)}:${pad(p.close.minute)}` : "late"}`)
  return spans.length ? spans.join(", ") : "Closed"
}

/** Whether the venue is open at a weekday + clock time. `undefined` = unknown. */
export function isOpenAt(place: RawPlace, day: number, time: string): boolean | undefined {
  const periods = place.regularOpeningHours?.periods
  if (!periods) return undefined
  if (periods.length === 1 && !periods[0]!.close) return true
  const at = day * 1440 + clockMinutes(time)
  const week = 7 * 1440
  for (const p of periods) {
    if (p.open?.day == null) continue
    const start = p.open.day * 1440 + (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0)
    let end = p.close?.day != null ? p.close.day * 1440 + (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0) : start + 1440
    if (end <= start) end += week
    if ((at >= start && at < end) || (at + week >= start && at + week < end)) return true
  }
  return false
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/coffee|cafe|bakery|tea_house|pastry|dessert|ice_cream/, "cafe"],
  [/bar$|^bar|pub|wine|brewery|night_club|cocktail/, "bar"],
  [/restaurant|food|meal|steak|sushi|pizza|bistro|diner/, "restaurant"],
  [/market/, "market"],
  [/museum|art_gallery/, "museum"],
  [/park|garden|beach|nature/, "park"],
  [/observation|scenic|viewpoint|lookout/, "viewpoint"],
  [/castle|palace/, "palace"],
  [/church|temple|shrine|mosque|synagogue|place_of_worship|monastery/, "shrine"],
  [/lodging|hotel|hostel|guest_house/, "hotel"],
  [/station|airport|transit|ferry|bus_stop/, "transit"],
  [/store|shop|mall|boutique/, "shopping"],
  [/tourist_attraction|historical|monument|landmark|cultural/, "landmark"],
  [/tour|spa|amusement|aquarium|zoo|theater|cinema|concert|event/, "experience"],
]

export function categoryFor(place: RawPlace): string {
  const types = [place.primaryType, ...(place.types ?? [])].filter((t): t is string => Boolean(t))
  for (const type of types) {
    for (const [re, category] of CATEGORY_RULES) if (re.test(type)) return category
  }
  return "venue"
}

/** Raw Places result → the card the traveller sees. */
export function toCardPlace(
  raw: RawPlace,
  opts: { anchor?: { name: string; point: LatLng } | null; weekdayIndex?: number; dayId?: string; time?: string } = {},
): ConciergeCardPlace | null {
  const name = raw.displayName?.text?.trim()
  if (!name) return null
  const place: ConciergeCardPlace = { ref: raw.id || `n:${norm(name)}`, name, category: categoryFor(raw) }
  if (raw.id) place.placeId = raw.id
  const address = raw.shortFormattedAddress || raw.formattedAddress
  if (address) place.address = address
  const lat = raw.location?.latitude
  const lng = raw.location?.longitude
  if (typeof lat === "number" && typeof lng === "number") {
    place.lat = lat
    place.lng = lng
    if (opts.anchor) place.walk = { from: opts.anchor.name, ...walkEstimate(opts.anchor.point, { lat, lng }) }
  }
  if (raw.googleMapsUri) place.mapsUrl = raw.googleMapsUri.split("&g_mp=")[0]
  if (typeof raw.rating === "number") place.rating = raw.rating
  if (typeof raw.userRatingCount === "number") place.ratingCount = raw.userRatingCount
  if (raw.priceLevel && PRICE[raw.priceLevel]) place.price = PRICE[raw.priceLevel]
  if (opts.weekdayIndex != null) {
    const hours = hoursOn(raw, opts.weekdayIndex)
    if (hours) {
      place.hours = hours
      place.hoursDay = SHORT_DAYS[opts.weekdayIndex]
    }
    if (opts.time) {
      const open = isOpenAt(raw, opts.weekdayIndex, opts.time)
      if (open != null) place.open = open
    }
  }
  if (opts.dayId) place.dayId = opts.dayId
  if (opts.time) place.time = opts.time
  return place
}

// ── Google Routes ────────────────────────────────────────────────────────

export type RouteMode = "transit" | "walk" | "drive"

export interface RouteSummary {
  mode: RouteMode
  minutes: number
  km: number
  /** Human steps for transit: "Train Cascais line → Cais do Sodré (3 stops, 7 min)". */
  steps?: string[]
  departs?: string
  arrives?: string
}

export type RoutesLookup = (args: {
  from: LatLng
  to: LatLng
  mode: RouteMode
  departAt?: Date | null
  timeZone?: string
  signal?: AbortSignal
}) => Promise<RouteSummary | null>

const ROUTE_MODE = { transit: "TRANSIT", walk: "WALK", drive: "DRIVE" } as const
const seconds = (value: unknown) => (typeof value === "string" ? Number.parseInt(value, 10) || 0 : 0)

interface RawRouteStep {
  travelMode?: string
  staticDuration?: string
  distanceMeters?: number
  transitDetails?: {
    stopDetails?: {
      departureStop?: { name?: string }
      arrivalStop?: { name?: string }
      departureTime?: string
      arrivalTime?: string
    }
    headsign?: string
    stopCount?: number
    transitLine?: { name?: string; nameShort?: string; vehicle?: { name?: { text?: string }; type?: string } }
  }
}

function clockIn(iso: string | undefined, timeZone?: string): string | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)
  } catch {
    return undefined
  }
}

/** Collapse Routes API steps into the handful of lines a person follows. */
export function summariseTransitSteps(steps: RawRouteStep[], timeZone?: string): string[] {
  const out: string[] = []
  let walkSeconds = 0
  let walkMeters = 0
  const flushWalk = () => {
    if (walkSeconds >= 60) out.push(`Walk ${Math.round(walkSeconds / 60)} min (${Math.round(walkMeters / 10) * 10} m)`)
    walkSeconds = 0
    walkMeters = 0
  }
  for (const step of steps) {
    const transit = step.transitDetails
    if (!transit) {
      walkSeconds += seconds(step.staticDuration)
      walkMeters += step.distanceMeters ?? 0
      continue
    }
    flushWalk()
    const line = transit.transitLine
    const vehicle = line?.vehicle?.name?.text || (line?.vehicle?.type ?? "Transit").toLowerCase().replace(/_/g, " ")
    const label = [vehicle, line?.nameShort || line?.name].filter(Boolean).join(" ")
    const departs = clockIn(transit.stopDetails?.departureTime, timeZone)
    out.push(
      `${label}${transit.headsign ? ` toward ${transit.headsign}` : ""}: ${transit.stopDetails?.departureStop?.name ?? "?"} → ${transit.stopDetails?.arrivalStop?.name ?? "?"}` +
        ` (${transit.stopCount ?? "?"} stops, ${Math.max(1, Math.round(seconds(step.staticDuration) / 60))} min${departs ? `, departs ${departs}` : ""})`,
    )
  }
  flushWalk()
  return out
}

export function createGoogleRoutes(apiKey: string, fetchImpl: typeof fetch = fetch): RoutesLookup {
  return async ({ from, to, mode, departAt, timeZone, signal }) => {
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: ROUTE_MODE[mode],
      languageCode: "en",
    }
    // Transit schedules need a time; other modes use typical conditions.
    if (mode === "transit" && departAt && departAt.getTime() > Date.now() - 6 * 86_400_000) {
      body.departureTime = departAt.toISOString()
    }
    const res = await fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails",
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      routes?: Array<{ duration?: string; distanceMeters?: number; legs?: Array<{ steps?: RawRouteStep[] }> }>
    }
    const route = json.routes?.[0]
    if (!route) return null
    const summary: RouteSummary = {
      mode,
      minutes: Math.max(1, Math.round(seconds(route.duration) / 60)),
      km: Math.round((route.distanceMeters ?? 0) / 100) / 10,
    }
    if (mode === "transit") {
      const steps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? []
      summary.steps = summariseTransitSteps(steps, timeZone)
      const rides = steps.filter((s) => s.transitDetails)
      summary.departs = clockIn(rides[0]?.transitDetails?.stopDetails?.departureTime, timeZone)
      summary.arrives = clockIn(rides[rides.length - 1]?.transitDetails?.stopDetails?.arrivalTime, timeZone)
    }
    return summary
  }
}

// ── Function declarations sent to Gemini ─────────────────────────────────

const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: "STRING", description, ...extra })

export const FIND_PLACES_DECLARATION = {
  name: "find_places",
  description:
    "Look up real, currently operating venues on Google Maps near a point of this trip. Returns names, addresses, ratings, opening hours on the day in question, whether each is open at the given time, and the walk from the anchor stop. Call it for every venue you intend to recommend or add, and to check the hours of a planned stop. Several calls in one turn are fine.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: S('What to look for, in a few words: "specialty coffee", "seafood dinner", "24 hour pharmacy", or one venue\'s exact name. Do not put the city or "near …" in it.'),
      nearItemId: S("itemId of the planned stop to search around. Omit to search around where the traveller is now (their shared position, else the stop the plan puts them at, else the day in view)."),
      nearArea: S('A neighbourhood or landmark to search in when no planned stop fits, e.g. "Alfama".'),
      dayId: S("The day the traveller would go. Sets which weekday's opening hours come back."),
      time: S("When they would arrive, 24h HH:mm. Sets the open/closed check."),
      radiusMeters: { type: "INTEGER", description: "Search radius. Default 1200; use 400 to 600 for 'right next to', 3000+ for a whole district." },
    },
    required: ["query"],
  },
}

export const GET_DIRECTIONS_DECLARATION = {
  name: "get_directions",
  description:
    "Real door-to-door routes between two points from Google Maps: public transport with lines, stops and times, plus walking and driving durations. Call it whenever the traveller asks how to get somewhere or how long a journey takes.",
  parameters: {
    type: "OBJECT",
    properties: {
      from: S('Origin: an itemId from the itinerary, a place ref from find_places, "me" for the traveller\'s shared position, or a place name.'),
      to: S("Destination: an itemId, a place ref, or a place name."),
      dayId: S("Day of travel (for timetables)."),
      departTime: S("Departure time, 24h HH:mm local."),
    },
    required: ["from", "to"],
  },
}

export const PROPOSE_CHANGES_DECLARATION = {
  name: "propose_changes",
  description:
    "Show the traveller a card with changes to the itinerary that they can apply in one tap (and undo). This is the ONLY way to change the plan; nothing is changed until they tap Apply. Use one call with every change of the request: a single re-time, or a whole planned morning as a batch of adds.",
  parameters: {
    type: "OBJECT",
    properties: {
      summary: S('A short title for the card, as an imperative: "Move dinner to 20:00", "Plan Saturday in Alfama".'),
      changes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            op: S("add = new stop; set_time = change a stop's time; move = to another day; remove = delete a stop; reorder = new order for one day.", {
              enum: ["add", "set_time", "move", "remove", "reorder"],
            }),
            itemId: S("set_time / move / remove: the stop's itemId from the itinerary."),
            dayId: S("add / reorder: the day. For add, the day the stop goes on."),
            toDayId: S("move: the destination day."),
            time: S("add / set_time / move: start time, 24h HH:mm. Always give one for an add (the natural hour for that kind of place, clear of the stops around it) unless the day has no times at all."),
            endTime: S("Optional end time, 24h HH:mm."),
            ref: S("add: the ref of a place from find_places (this turn or an earlier one). Preferred."),
            name: S("add without a ref: the venue's exact name."),
            address: S("add without a ref: its street address."),
            notes: S("add: one line for the stop's note: what to do or order there, or how to get there."),
            order: { type: "ARRAY", items: { type: "STRING" }, description: "reorder: every itemId of that day in the new order." },
          },
          required: ["op"],
        },
      },
    },
    required: ["summary", "changes"],
  },
}

// ── Tool execution ───────────────────────────────────────────────────────

export interface ConciergeToolContext {
  trip: Trip
  /** Day in view in the app. */
  dayId?: string
  /** Today's dayId during the trip. */
  todayId?: string
  /** Local clock "HH:mm" at the destination. */
  clock: string
  /** The traveller's shared position, if they chose to send it. */
  location?: LatLng | null
  /** Stop the plan puts the traveller at right now. */
  currentStop?: ItineraryItem | null
  searchPlaces?: PlacesSearch | null
  routes?: RoutesLookup | null
  geocode?: PlaceGeocoder | null
  signal?: AbortSignal
  /** Every place found or carried over from earlier turns, by ref. */
  places: Map<string, ConciergeCardPlace>
  /** Refs in the order find_places returned them this turn. */
  found: string[]
  /** Google Maps links for routes looked up this turn. */
  routeLinks?: Array<{ title: string; uri: string }>
}

function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  }
}

function dayPoints(day: TripDay | undefined): LatLng[] {
  return (day?.items ?? []).map(itemPoint).filter((p): p is LatLng => p !== null)
}

const stopName = (item: ItineraryItem) => item.location?.name?.trim() || item.title

/** Where the traveller sleeps, when the itinerary says. */
export function hotelAnchor(trip: Trip): { name: string; point: LatLng } | null {
  const hotel = trip.days
    .flatMap((d) => d.items)
    .find((i) => (i.reservation?.type === "hotel" || i.location?.category === "hotel") && itemPoint(i))
  return hotel ? { name: stopName(hotel), point: itemPoint(hotel)! } : null
}

/** Where a search with no explicit anchor should look. */
export function defaultAnchor(ctx: ConciergeToolContext, dayId?: string): { name: string; point: LatLng } | null {
  const day = dayId ? ctx.trip.days.find((d) => d.id === dayId) : undefined
  const sameDayAsNow = !dayId || dayId === ctx.todayId
  if (sameDayAsNow && ctx.location) return { name: "you", point: ctx.location }
  const current = sameDayAsNow ? itemPoint(ctx.currentStop ?? undefined) : null
  if (current && ctx.currentStop) return { name: stopName(ctx.currentStop), point: current }
  const pools = [day, ctx.trip.days.find((d) => d.id === ctx.dayId), ctx.trip.days.find((d) => d.id === ctx.todayId)]
  for (const pool of pools) {
    const centre = centroid(dayPoints(pool))
    if (centre && pool) return { name: pool.title?.trim() || "the day's stops", point: centre }
  }
  const hotel = hotelAnchor(ctx.trip)
  if (hotel) return hotel
  const all = centroid(ctx.trip.days.flatMap(dayPoints))
  if (all) return { name: ctx.trip.destinations[0] ?? "the trip", point: all }
  if (ctx.trip.center) return { name: ctx.trip.destinations[0] ?? "the trip", point: ctx.trip.center }
  return null
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)

export interface ToolOutcome {
  /** What the model gets back. */
  response: Record<string, unknown>
  /** One line for the traveller while it runs. */
  status: { kind: "places" | "directions" | "proposal"; label: string; detail?: string }
}

export function describeToolCall(name: string, args: Record<string, unknown>, trip: Trip): ToolOutcome["status"] {
  if (name === "find_places") {
    const nearItem = findItem(trip, args.nearItemId)?.item
    const near = (nearItem ? stopName(nearItem) : undefined) ?? str(args.nearArea)
    return { kind: "places", label: "Checking Google Maps", detail: [str(args.query), near ? `near ${near}` : null].filter(Boolean).join(" ") }
  }
  if (name === "get_directions") {
    const label = (value: unknown) => {
      const item = findItem(trip, value)?.item
      return item ? stopName(item) : str(value) === "me" ? "you" : undefined
    }
    const from = label(args.from)
    const to = label(args.to)
    return { kind: "directions", label: "Working out the route", detail: from && to ? `${from} to ${to}` : undefined }
  }
  return { kind: "proposal", label: "Preparing the changes", detail: str(args.summary) }
}

export async function runFindPlaces(args: Record<string, unknown>, ctx: ConciergeToolContext): Promise<Record<string, unknown>> {
  const query = str(args.query)
  if (!query) return { error: "query is required" }
  if (!ctx.searchPlaces) return { error: "Place lookup is unavailable. Use Google Search and say you could not check Maps." }

  const dayId = str(args.dayId) && ctx.trip.days.some((d) => d.id === args.dayId) ? (args.dayId as string) : undefined
  const day = ctx.trip.days.find((d) => d.id === (dayId ?? ctx.todayId ?? ctx.dayId))
  const time = normaliseTime(args.time) ?? (day && day.id === ctx.todayId ? ctx.clock : undefined)
  const nearItem = findItem(ctx.trip, args.nearItemId, dayId)
  const nearPoint = itemPoint(nearItem?.item)
  const area = str(args.nearArea)
  const anchor = nearPoint && nearItem ? { name: stopName(nearItem.item), point: nearPoint } : area ? null : defaultAnchor(ctx, dayId)
  // An area search has no stop to measure from: show the walk from the hotel.
  const measureFrom = anchor ?? hotelAnchor(ctx.trip)
  const city = day?.city || ctx.trip.destinations[0] || ""
  const radius = typeof args.radiusMeters === "number" && Number.isFinite(args.radiusMeters) ? args.radiusMeters : 1200

  let raw: RawPlace[]
  try {
    raw = await ctx.searchPlaces({
      query: area ? `${query} in ${area}, ${city}` : anchor ? query : `${query} in ${city}`,
      center: anchor?.point ?? defaultAnchor(ctx, dayId)?.point ?? null,
      radiusMeters: area ? 2500 : radius,
      limit: 6,
      signal: ctx.signal,
    })
  } catch (error) {
    if (ctx.signal?.aborted) throw error
    return { error: "Google Maps did not answer. Say you could not check live." }
  }

  const weekdayIndex = day ? new Date(`${day.date}T00:00:00Z`).getUTCDay() : undefined
  const results: Array<Record<string, unknown>> = []
  for (const candidate of raw) {
    const card = toCardPlace(candidate, { anchor: measureFrom, weekdayIndex, dayId: day?.id, time })
    if (!card) continue
    ctx.places.set(card.ref, card)
    if (!ctx.found.includes(card.ref)) ctx.found.push(card.ref)
    const existing = onTrip(ctx.trip, card.name, card.placeId)
    const entry: Record<string, unknown> = { ref: card.ref, name: card.name, type: candidate.primaryType ?? card.category }
    if (card.address) entry.address = card.address
    if (card.rating != null) entry.rating = `${card.rating} (${card.ratingCount ?? 0} reviews)`
    if (card.price) entry.price = card.price
    if (candidate.businessStatus && candidate.businessStatus !== "OPERATIONAL") entry.status = candidate.businessStatus
    if (card.hours && day) entry.hours = `${weekday(day.date)}: ${card.hours}`
    if (card.open != null && time) entry.openAt = `${time}: ${card.open ? "open" : "CLOSED"}`
    if (card.walk && measureFrom) entry.distance = `${describeWalk(measureFrom.point, { lat: card.lat!, lng: card.lng! })} from ${measureFrom.name}`
    if (candidate.editorialSummary?.text) entry.about = candidate.editorialSummary.text
    if (existing) entry.alreadyOnTrip = `Day ${existing.index + 1}${existing.item.time ? ` at ${existing.item.time}` : ""} (itemId ${existing.item.id})`
    results.push(entry)
  }
  if (results.length === 0) return { places: [], note: "Nothing matched. Try a broader query or a larger radius." }
  return {
    searchedAround: anchor?.name ?? area ?? city,
    ...(day ? { day: `${weekday(day.date)} ${day.date}` } : {}),
    places: results,
    note: "Distances are straight-line walking estimates. Hours are regular hours from Google Maps: holidays can differ.",
  }
}

async function resolvePoint(
  value: unknown,
  ctx: ConciergeToolContext,
  dayId?: string,
): Promise<{ name: string; point: LatLng } | null> {
  const key = str(value)
  if (!key) return null
  if (/^(me|here|my location|current location)$/i.test(key)) {
    if (ctx.location) return { name: "your position", point: ctx.location }
    const current = itemPoint(ctx.currentStop ?? undefined)
    return current && ctx.currentStop ? { name: ctx.currentStop.title, point: current } : null
  }
  const place = ctx.places.get(key)
  if (place?.lat != null && place.lng != null) return { name: place.name, point: { lat: place.lat, lng: place.lng } }
  const stop = findItem(ctx.trip, key, dayId)
  const stopPoint = itemPoint(stop?.item)
  if (stop && stopPoint) return { name: stop.item.location?.name || stop.item.title, point: stopPoint }
  if (ctx.searchPlaces) {
    const [hit] = await ctx
      .searchPlaces({ query: stop?.item.title ?? key, center: defaultAnchor(ctx, dayId)?.point ?? null, radiusMeters: 20_000, limit: 1, signal: ctx.signal })
      .catch(() => [] as RawPlace[])
    const lat = hit?.location?.latitude
    const lng = hit?.location?.longitude
    if (hit && typeof lat === "number" && typeof lng === "number") return { name: hit.displayName?.text ?? key, point: { lat, lng } }
  }
  if (ctx.geocode) {
    const geo = await ctx.geocode(`${key}, ${ctx.trip.destinations[0] ?? ""}`).catch(() => null)
    if (geo) return { name: key, point: { lat: geo.lat, lng: geo.lng } }
  }
  return null
}

export async function runGetDirections(args: Record<string, unknown>, ctx: ConciergeToolContext): Promise<Record<string, unknown>> {
  if (!ctx.routes) return { error: "Directions are unavailable. Give general guidance and say you could not check live." }
  const dayId = str(args.dayId) && ctx.trip.days.some((d) => d.id === args.dayId) ? (args.dayId as string) : (ctx.dayId ?? ctx.todayId)
  const [from, to] = await Promise.all([resolvePoint(args.from, ctx, dayId), resolvePoint(args.to, ctx, dayId)])
  if (!from || !to) return { error: `Could not locate ${!from ? "the origin" : "the destination"}. Ask the traveller which place they mean.` }

  const day = ctx.trip.days.find((d) => d.id === dayId)
  const time = normaliseTime(args.departTime) ?? (day?.id === ctx.todayId ? ctx.clock : undefined)
  const departAt = day && time ? zonedToUtc(day.date, time, ctx.trip.timezone) : null
  const lookup = (mode: RouteMode) =>
    ctx.routes!({ from: from.point, to: to.point, mode, departAt, timeZone: ctx.trip.timezone, signal: ctx.signal }).catch(() => null)
  const [transit, walk, drive] = await Promise.all([lookup("transit"), lookup("walk"), lookup("drive")])
  if (!transit && !walk && !drive) return { error: "Google Maps returned no route. Say you could not check live." }

  const out: Record<string, unknown> = { from: from.name, to: to.name }
  ctx.routeLinks?.push({
    title: `${from.name} to ${to.name}`,
    uri: `https://www.google.com/maps/dir/?api=1&origin=${from.point.lat},${from.point.lng}&destination=${to.point.lat},${to.point.lng}`,
  })
  if (time && day) out.departing = `${weekday(day.date)} ${time}`
  if (walk) out.walk = `${walk.minutes} min (${walk.km} km)`
  if (drive) out.taxiOrRideHail = `${drive.minutes} min driving (${drive.km} km), before waiting time`
  if (transit) {
    out.publicTransport = {
      total: `${transit.minutes} min`,
      ...(transit.departs && transit.arrives ? { firstDeparture: transit.departs, arrives: transit.arrives } : {}),
      steps: transit.steps?.length ? transit.steps : ["Walking is the whole route: no useful transit."],
    }
  }
  return out
}

const short = (prefix: string, n: number) => `${prefix}${n + 1}`

/** Validate a proposed batch against the itinerary. Bad entries are dropped
 *  with a reason the model can act on; good ones become the proposal. */
export async function runProposeChanges(
  args: Record<string, unknown>,
  ctx: ConciergeToolContext,
): Promise<{ proposal: ConciergeProposal | null; response: Record<string, unknown> }> {
  const rawChanges = Array.isArray(args.changes) ? args.changes.slice(0, 16) : []
  const changes: ProposalChange[] = []
  const rejected: string[] = []
  const dayOf = (id: unknown) => (typeof id === "string" ? ctx.trip.days.find((d) => d.id === id) : undefined)

  for (const [index, raw] of rawChanges.entries()) {
    if (!raw || typeof raw !== "object") continue
    const change = raw as Record<string, unknown>
    const op = str(change.op)
    const id = short("c", index)
    const time = normaliseTime(change.time)
    const endTime = normaliseTime(change.endTime)
    const label = `change ${index + 1} (${op ?? "?"})`

    if (op === "add") {
      const day = dayOf(change.dayId) ?? dayOf(ctx.dayId) ?? dayOf(ctx.todayId)
      if (!day) {
        rejected.push(`${label}: dayId is missing or not on this trip.`)
        continue
      }
      let place = str(change.ref) ? ctx.places.get(str(change.ref)!) : undefined
      const name = str(change.name)
      const planned = !place && name ? onTrip(ctx.trip, name) : null
      if (planned) {
        rejected.push(
          `${label}: ${planned.item.title} is already on Day ${planned.index + 1} (itemId ${planned.item.id}). Use set_time or move instead.`,
        )
        continue
      }
      if (!place && name) {
        place = [...ctx.places.values()].find((p) => sameVenue(p.name, name))
        if (!place && ctx.searchPlaces) {
          const anchor = defaultAnchor(ctx, day.id)
          const [hit] = await ctx
            .searchPlaces({ query: [name, str(change.address)].filter(Boolean).join(", "), center: anchor?.point ?? null, radiusMeters: 15_000, limit: 1, signal: ctx.signal })
            .catch(() => [] as RawPlace[])
          const card = hit ? toCardPlace(hit) : null
          if (card && sameVenue(card.name, name)) place = card
        }
        if (!place && ctx.geocode) {
          const geo = await ctx.geocode([name, str(change.address), day.city ?? ctx.trip.destinations[0]].filter(Boolean).join(", ")).catch(() => null)
          if (geo) place = { ref: `n:${norm(name)}`, name, address: str(change.address) ?? geo.address, lat: geo.lat, lng: geo.lng, placeId: geo.placeId }
        }
      }
      if (!place) {
        rejected.push(`${label}: could not find that venue. Look it up with find_places and pass its ref.`)
        continue
      }
      const existing = onTrip(ctx.trip, place.name, place.placeId)
      if (existing) {
        rejected.push(`${label}: ${place.name} is already on Day ${existing.index + 1} (itemId ${existing.item.id}). Use set_time or move instead.`)
        continue
      }
      if (changes.some((c) => c.op === "add" && c.dayId === day.id && c.place.ref === place!.ref)) continue
      const notes = str(change.notes)?.slice(0, 400)
      // No time given: fall back to the slot the card suggested for this day.
      const slot = time ?? (place.dayId === day.id ? place.time : undefined)
      changes.push({ id, op: "add", dayId: day.id, ...(slot ? { time: slot } : {}), ...(endTime ? { endTime } : {}), ...(notes ? { notes } : {}), place: { ...place, dayId: day.id, ...(slot ? { time: slot } : {}) } })
      continue
    }

    if (op === "reorder") {
      const day = dayOf(change.dayId)
      const order = Array.isArray(change.order) ? change.order.filter((v): v is string => typeof v === "string") : []
      if (!day || order.length === 0) {
        rejected.push(`${label}: needs a dayId on this trip and the full order of itemIds.`)
        continue
      }
      const ids = new Set(day.items.map((i) => i.id))
      const wanted = [...new Set(order.map((v) => findItem(ctx.trip, v, day.id)?.item.id).filter((v): v is string => Boolean(v) && ids.has(v!)))]
      const full = [...wanted, ...day.items.map((i) => i.id).filter((v) => !wanted.includes(v))]
      if (full.every((v, i) => v === day.items[i]!.id)) {
        rejected.push(`${label}: that is already the order of the day.`)
        continue
      }
      changes.push({ id, op: "reorder", dayId: day.id, order: full, titles: full.map((v) => day.items.find((i) => i.id === v)!.title) })
      continue
    }

    const target = findItem(ctx.trip, change.itemId ?? change.name, str(change.dayId))
    if (!target) {
      rejected.push(`${label}: no stop with that itemId on the itinerary.`)
      continue
    }
    const { day, item } = target
    if (op === "remove") {
      changes.push({ id, op: "remove", dayId: day.id, itemId: item.id, title: item.title })
    } else if (op === "set_time") {
      if (!time) rejected.push(`${label}: needs a time as HH:mm.`)
      else if (time === item.time && (!endTime || endTime === item.endTime)) rejected.push(`${label}: ${item.title} is already at ${time}.`)
      else changes.push({ id, op: "set_time", dayId: day.id, itemId: item.id, title: item.title, ...(item.time ? { from: item.time } : {}), time, ...(endTime ? { endTime } : {}) })
    } else if (op === "move") {
      const toDay = dayOf(change.toDayId)
      if (!toDay) rejected.push(`${label}: toDayId is missing or not on this trip.`)
      else if (toDay.id === day.id) {
        if (time && time !== item.time) changes.push({ id, op: "set_time", dayId: day.id, itemId: item.id, title: item.title, ...(item.time ? { from: item.time } : {}), time })
        else rejected.push(`${label}: ${item.title} is already on that day.`)
      } else changes.push({ id, op: "move", itemId: item.id, title: item.title, fromDayId: day.id, toDayId: toDay.id, ...(time ? { time } : {}) })
    } else {
      rejected.push(`${label}: unknown op.`)
    }
  }

  if (changes.length === 0) {
    return {
      proposal: null,
      response: { shown: 0, rejected, note: "No card was shown. Fix the problems and call propose_changes again, or tell the traveller plainly what is missing." },
    }
  }
  const proposal: ConciergeProposal = {
    id: `prop-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    summary: str(args.summary)?.slice(0, 120) ?? "Update the itinerary",
    changes,
  }
  return {
    proposal,
    response: {
      shown: changes.length,
      ...(rejected.length ? { rejected } : {}),
      note: "The traveller now sees a card listing these changes with an Apply button. Nothing has changed yet. Reply in one or two lines: say what the card does and anything they should know. Do not list the changes again.",
    },
  }
}
