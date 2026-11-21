import { useEffect, useMemo, useState } from "react"
import { Effect } from "effect"
import { fetchExternal, parseJson, requireOk } from "../../effect/http"
import { TimeoutError } from "../../effect/errors"
import { runPromise } from "../../effect/runtime"
import { todayIsoIn } from "./meta"
import { dayCountries } from "./prep/essentials"
import type { Trip } from "./types"

// Public holidays on the trip's days, in the country each day is spent in,
// from Nager.Date (keyless, through `fetchExternal`): one request per country
// and year, kept in memory and in localStorage for a month. Only nationwide
// public holidays count (not observances, school days or one region's), and
// only from today on, since a holiday is news for planning, not for the past.
// No data, or a country Nager.Date does not cover, shows nothing.

export interface Holiday {
  /** ISO date. */
  date: string
  /** English name: "Christmas Day". */
  name: string
  /** The name in the country's language: "성탄절". */
  localName: string
  /** ISO 3166-1 alpha-2. */
  country: string
}

const ENDPOINT = "https://date.nager.at/api/v3/PublicHolidays"
const TTL_MS = 30 * 24 * 60 * 60_000
const DEADLINE = "8 seconds"
const STORE_PREFIX = "trips-holidays-v1:"
const MAX_NAME = 120

/** A holiday row (Nager.Date's, or our own stored copy) checked field by field; null when malformed. */
function cleanHoliday(row: unknown, country: string): Holiday | null {
  if (typeof row !== "object" || row === null) return null
  const r = row as Record<string, unknown>
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || typeof r.name !== "string" || !r.name.trim()) return null
  const name = r.name.trim().slice(0, MAX_NAME)
  const localName = typeof r.localName === "string" && r.localName.trim() ? r.localName.trim().slice(0, MAX_NAME) : name
  return { date: r.date, name, localName, country }
}

/** Nager.Date's rows → nationwide public holidays. Anything malformed is skipped. */
export function readHolidays(body: unknown, country: string): Holiday[] {
  if (!Array.isArray(body)) return []
  return body.flatMap((row: unknown) => {
    const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>
    const types = Array.isArray(r.types) ? r.types : typeof r.type === "string" ? [r.type] : []
    const holiday = r.global === true && types.includes("Public") ? cleanHoliday(row, country) : null
    return holiday ? [holiday] : []
  })
}

/** A day the trip has, the country it is spent in, and the Nager.Date list that covers it. */
export interface HolidayDay {
  dayId: string
  date: string
  country: string
  /** "KR:2026". */
  list: string
}

/** The trip's days from `today` on, each with its country; days whose country is unknown are left out. */
export function holidayDays(trip: Pick<Trip, "destinations" | "timezone" | "days">, today: string): HolidayDay[] {
  const countries = dayCountries(trip)
  return trip.days.flatMap((day) => {
    const country = countries.get(day.id)
    if (!country || day.date < today) return []
    return [{ dayId: day.id, date: day.date, country: country.code, list: `${country.code}:${day.date.slice(0, 4)}` }]
  })
}

/** dayId → its public holidays, from the lists that have answered. */
export function holidaysByDay(days: readonly HolidayDay[], lists: ReadonlyMap<string, readonly Holiday[]>): Map<string, Holiday[]> {
  const out = new Map<string, Holiday[]>()
  for (const day of days) {
    const found = lists.get(day.list)?.filter((holiday) => holiday.date === day.date) ?? []
    // Nager.Date lists a holiday once per region it applies to; one name is enough.
    const unique = found.filter((holiday, i) => found.findIndex((other) => other.name === holiday.name) === i)
    if (unique.length) out.set(day.dayId, unique)
  }
  return out
}

/** "Christmas Day" / "public holiday: shops and museums may close or keep short hours". */
export function holidayLine(holidays: readonly Holiday[]): { names: string; note: string } {
  const names = [...new Set(holidays.map((holiday) => holiday.name))]
  return {
    names: names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? ""),
    note: `public ${names.length > 1 ? "holidays" : "holiday"}: shops and museums may close or keep short hours`,
  }
}

// ── Fetching and the cache ───────────────────────────────────────────────

const fetchListEffect = Effect.fn("Holidays.fetch")(function* (list: string) {
  const [country, year] = list.split(":")
  const res = yield* fetchExternal(`${ENDPOINT}/${encodeURIComponent(year ?? "")}/${encodeURIComponent(country ?? "")}`).pipe(
    Effect.timeoutFail({ duration: DEADLINE, onTimeout: () => new TimeoutError({ message: "Public holidays took too long" }) }),
  )
  // A country Nager.Date does not cover: a real answer, and an empty one.
  if (res.status === 404 || res.status === 204) return [] as Holiday[]
  yield* requireOk(res)
  return readHolidays(yield* parseJson<unknown>(res), country ?? "")
})

const memory = new Map<string, { at: number; holidays: Holiday[] }>()
/** Lists in flight, so the day header and Essentials asking at once share one request. */
const inflight = new Map<string, Promise<Holiday[]>>()

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function readCached(list: string): Holiday[] | null {
  const now = Date.now()
  const hit = memory.get(list)
  if (hit && now - hit.at < TTL_MS) return hit.holidays
  try {
    const raw = storage()?.getItem(STORE_PREFIX + list)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: unknown; holidays?: unknown }
    if (typeof parsed.at !== "number" || now - parsed.at >= TTL_MS) return null
    // Stored by us, but storage is still outside the program: read back through the same checks.
    const country = list.split(":")[0] ?? ""
    const holidays = (Array.isArray(parsed.holidays) ? parsed.holidays : []).flatMap((row: unknown) => {
      const holiday = cleanHoliday(row, country)
      return holiday ? [holiday] : []
    })
    memory.set(list, { at: parsed.at, holidays })
    return holidays
  } catch {
    return null
  }
}

function writeCached(list: string, holidays: Holiday[]) {
  const now = Date.now()
  memory.set(list, { at: now, holidays })
  try {
    storage()?.setItem(STORE_PREFIX + list, JSON.stringify({ at: now, holidays }))
  } catch {
    // Full or blocked storage: the memory copy still serves this visit.
  }
}

/** One country's year of holidays. Rejects when the service fails; a failure is never kept. */
function loadList(list: string): Promise<Holiday[]> {
  const cached = readCached(list)
  if (cached) return Promise.resolve(cached)
  let request = inflight.get(list)
  if (!request) {
    request = runPromise(fetchListEffect(list))
      .then((holidays) => {
        writeCached(list, holidays)
        return holidays
      })
      .finally(() => inflight.delete(list))
    inflight.set(list, request)
  }
  return request
}

// ── Hook ─────────────────────────────────────────────────────────────────

const NONE: ReadonlyMap<string, readonly Holiday[]> = new Map()

/**
 * dayId → the public holidays that fall on it where it is spent, for the
 * trip's days from today on (`today` pins it; else the trip's own today).
 * Fetches only the country-years the trip's days need, and only when they
 * change; what failed is simply missing.
 */
export function useHolidays(trip: Pick<Trip, "destinations" | "timezone" | "days"> | null, today?: string): ReadonlyMap<string, readonly Holiday[]> {
  const from = today ?? (trip ? todayIsoIn(trip.timezone) : "")
  const days = useMemo(() => (trip ? holidayDays(trip, from) : []), [trip, from])
  const wanted = [...new Set(days.map((day) => day.list))].sort().join(",")
  const cached = useMemo(() => {
    const hits = new Map<string, Holiday[]>()
    for (const list of wanted ? wanted.split(",") : []) {
      const hit = readCached(list)
      if (hit) hits.set(list, hit)
    }
    return hits
  }, [wanted])
  const missing = wanted ? wanted.split(",").filter((list) => !cached.has(list)).join(",") : ""
  const [loaded, setLoaded] = useState<ReadonlyMap<string, Holiday[]>>(new Map())

  useEffect(() => {
    if (!missing) return
    let live = true
    void Promise.all(missing.split(",").map((list) => loadList(list).then((holidays) => [list, holidays] as const, () => null))).then((answers) => {
      if (!live) return
      setLoaded((before) => {
        const next = new Map(before)
        for (const answer of answers) if (answer) next.set(answer[0], answer[1])
        return next
      })
    })
    return () => {
      live = false
    }
  }, [missing])

  return useMemo(() => {
    if (days.length === 0) return NONE
    const lists = new Map([...loaded, ...cached])
    return lists.size ? holidaysByDay(days, lists) : NONE
  }, [days, cached, loaded])
}

/** Test seam: forget what was fetched this session. */
export function forgetHolidays() {
  memory.clear()
  inflight.clear()
}
