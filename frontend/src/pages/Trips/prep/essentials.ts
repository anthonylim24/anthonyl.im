import type { Trip } from "../types"
import { COUNTRIES, EXTRA_ZONES, PLACES, type Country, type CountryCode, type Mains } from "./countries"

// Which countries a trip goes to, and the clock maths the Essentials panel
// shows. Pure: data in, data out.

/** Lower case, no accents or punctuation: "Côte d’Azur" → "cote dazur", "Đà Nẵng" → "da nang". */
export function normalizePlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/ł/g, "l")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/['’.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

interface PlaceHit {
  code: CountryCode
  /** The place's own zone, when its country spans several. */
  zone?: string
}

const NAMES = new Map<string, PlaceHit>()
for (const country of Object.values(COUNTRIES)) {
  for (const name of [country.name, ...(country.aliases ?? [])]) NAMES.set(normalizePlace(name), { code: country.code })
}
for (const [name, value] of Object.entries(PLACES)) {
  const key = normalizePlace(name)
  if (!NAMES.has(key)) NAMES.set(key, typeof value === "string" ? { code: value } : { code: value[0], zone: value[1] })
}

// Names searched for inside a longer phrase ("Southern Italy", "Tokyo Japan"),
// longest first so "New Mexico" is found before "Mexico". Short names are left
// to exact matches: "Nice", "Bath" and "Male" are also ordinary words.
const SEARCHABLE = [...NAMES.entries()]
  .filter(([name, hit]) => name.length >= (isCountryName(name, hit.code) ? 4 : 5))
  .sort((x, y) => y[0].length - x[0].length)

function isCountryName(name: string, code: CountryCode): boolean {
  const country = COUNTRIES[code]
  return [country.name, ...(country.aliases ?? [])].some((n) => normalizePlace(n) === name)
}

const ZONES = new Map<string, CountryCode>()
for (const country of Object.values(COUNTRIES)) ZONES.set(country.zone, country.code)
for (const value of Object.values(PLACES)) if (typeof value !== "string") ZONES.set(value[1], value[0])
for (const [zone, code] of Object.entries(EXTRA_ZONES)) ZONES.set(zone, code)

/** The country an IANA zone belongs to, when it is one we know. */
export function countryForZone(zone: string | undefined): Country | undefined {
  const code = zone ? ZONES.get(zone) : undefined
  return code ? COUNTRIES[code] : undefined
}

// "South Korea — Seoul + Busan", "Paris, Lyon", "Rome / Florence & Venice",
// "Seoul to Busan". A hyphen only splits with spaces round it, so
// "Saint-Tropez" and "Kinkaku-ji" stay whole.
const SEPARATORS = /[,;+&/|·•→()[\]\n]|\s[-–—]\s|[–—]|->|\s(?:and|to|via|then)\s/i

function placesIn(text: string): PlaceHit[] {
  const whole = NAMES.get(normalizePlace(text))
  if (whole) return [whole]
  const hits: PlaceHit[] = []
  for (const part of text.split(SEPARATORS)) {
    const token = normalizePlace(part)
    if (!token) continue
    const exact = NAMES.get(token)
    if (exact) {
      hits.push(exact)
      continue
    }
    hits.push(...namesWithin(token))
  }
  return hits
}

/** Known names inside a longer phrase, each span claimed by the longest name that fits it. */
function namesWithin(token: string): PlaceHit[] {
  let rest = ` ${token} `
  const found: Array<{ at: number; hit: PlaceHit }> = []
  for (const [name, hit] of SEARCHABLE) {
    const at = rest.indexOf(` ${name} `)
    if (at < 0) continue
    found.push({ at, hit })
    rest = rest.slice(0, at) + " ".repeat(name.length + 1) + rest.slice(at + name.length + 1)
  }
  return found.sort((x, y) => x.at - y.at).map((f) => f.hit)
}

type TripPlaces = Pick<Trip, "destinations" | "timezone"> & { days?: ReadonlyArray<{ city?: string }> }

function tripHits(trip: TripPlaces): PlaceHit[] {
  const texts = [...trip.destinations, ...(trip.days ?? []).map((day) => day.city ?? "")]
  return texts.flatMap((text) => (text.trim() ? placesIn(text) : []))
}

/**
 * The countries a trip goes to, in the order its destinations (then its
 * days' cities) name them. Falls back to the trip's time zone; `[]` when
 * nothing is recognised.
 */
export function countriesFor(trip: TripPlaces): Country[] {
  const codes = [...new Set(tripHits(trip).map((hit) => hit.code))]
  if (codes.length > 0) return codes.map((code) => COUNTRIES[code])
  const byZone = countryForZone(trip.timezone)
  return byZone ? [byZone] : []
}

type TripDays = Pick<Trip, "destinations" | "timezone"> & { days: ReadonlyArray<{ id: string; city?: string; timezone?: string }> }

/**
 * The country each day is spent in: the day's own zone, else its city, else
 * the day before's country. The first days start from the trip's own zone
 * when that is one of its countries, else from the first destination. A day
 * is left out only when the trip's countries are unknown.
 */
export function dayCountries(trip: TripDays): Map<string, Country> {
  const countries = countriesFor(trip)
  const out = new Map<string, Country>()
  if (countries.length === 0) return out
  const home = countryForZone(trip.timezone)
  let carry = countries.find((country) => country.code === home?.code) ?? countries[0]!
  for (const day of trip.days) {
    const city = day.city?.trim() ? placesIn(day.city)[0] : undefined
    const own = countryForZone(day.timezone) ?? (city ? COUNTRIES[city.code] : undefined)
    if (own) carry = own
    out.set(day.id, carry)
  }
  return out
}

/** The zone to show a country's clock in: the trip's own, a named city's, or the capital's. */
export function localZone(trip: TripPlaces, country: Country): string {
  if (countryForZone(trip.timezone)?.code === country.code) return trip.timezone
  const named = tripHits(trip).find((hit) => hit.code === country.code && hit.zone)
  return named?.zone ?? country.zone
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ")
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Minutes the zone is ahead of UTC at that instant (DST included); null for an unknown zone. */
export function zoneOffsetMinutes(zone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
    const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"))
    const offset = Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
    return Number.isFinite(offset) ? offset : null
  } catch {
    return null
  }
}

export interface TimeDifference {
  /** How far the trip's clock is ahead of the viewer's (negative: behind). 5.5 is 5 h 30 min. */
  hours: number
  /** "8 h ahead of you", "3 h 30 min behind you", "Same time as you". */
  label: string
}

export function timeDifference(tripZone: string, viewerZone: string, at: Date): TimeDifference | null {
  const trip = zoneOffsetMinutes(tripZone, at)
  const viewer = zoneOffsetMinutes(viewerZone, at)
  if (trip === null || viewer === null) return null
  const minutes = trip - viewer
  if (minutes === 0) return { hours: 0, label: "Same time as you" }
  const size = Math.abs(minutes)
  const h = Math.floor(size / 60)
  const m = size % 60
  const amount = [h > 0 ? `${h} h` : "", m > 0 ? `${m} min` : ""].filter(Boolean).join(" ")
  return { hours: minutes / 60, label: `${amount} ${minutes > 0 ? "ahead of" : "behind"} you` }
}

/** "Fri 9:41 PM" in that zone; null for an unknown zone. */
export function formatLocalTime(zone: string, at: Date): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(at)
  } catch {
    return null
  }
}

/** "220 V · 60 Hz", "127 / 220 V · 60 Hz", "100 V · 50 / 60 Hz". */
export function formatMains(mains: Mains): string {
  return `${mains.volts.join(" / ")} V · ${mains.hertz.join(" / ")} Hz`
}

/** Socket types at the destination that the traveller's plugs don't fit; `[]` when they fit. */
export function plugsToAdapt(home: Country, destination: Country): readonly string[] {
  if (!home.plugs || !destination.plugs) return []
  const fits = destination.plugs.some((type) => home.plugs?.includes(type))
  return fits ? [] : destination.plugs
}

type VoltageBand = "low" | "high" | "mixed"

function band(mains: Mains | undefined): VoltageBand | null {
  if (!mains) return null
  if (mains.volts.every((v) => v <= 127)) return "low"
  if (mains.volts.every((v) => v >= 220)) return "high"
  return "mixed"
}

/** True when home runs on 100–127 V and the destination on 220–240 V, or the other way round. */
export function voltageDiffers(home: Country, destination: Country): boolean {
  const from = band(home.power)
  const to = band(destination.power)
  return from !== null && to !== null && from !== "mixed" && to !== "mixed" && from !== to
}
