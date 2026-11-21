import { useEffect, useMemo, useState } from "react"
import { Effect } from "effect"
import { fetchExternal, parseJson, requireOk } from "../../effect/http"
import { TimeoutError } from "../../effect/errors"
import { runPromise } from "../../effect/runtime"
import { addDays, daysBetween } from "./meta"
import { perPlace, placesQuery, type OpenMeteoPlace } from "./openMeteo"
import { SKY_ORDER, wmoSky, type SkyId } from "./wmo"
// Types only: forecast.ts imports this module, so nothing runs across the pair.
import type { ForecastRequest } from "./forecast"

// The weather typical of a date, for trip days past the live forecast's
// reach: what the same dates (three days either side) were like at the same
// place over the last three years, from Open-Meteo's archive (keyless,
// through `fetchExternal`). History, never a forecast, and the day header
// says so ("Typical for late December · based on the last 3 years").
//
// Every place and year goes in one request (the archive takes a list of
// places, each with its own dates), and answers are kept in memory and in
// localStorage for a month: the past does not change.

export interface TypicalDay {
  /** The trip date it describes. */
  date: string
  /** Medians of the sampled days' highs and lows. */
  highC: number
  lowC: number
  /** Share of the sampled days with 1 mm or more of rain (or melted snow), 0–100. */
  rainChance: number
  /** A WMO code for the most common sky among the sampled days. */
  code: number
  /** How many years gave samples: 3 when the archive answered in full. */
  years: number
}

/** One day of the archive at a place. */
export interface ClimateSample {
  date: string
  highC: number | null
  lowC: number | null
  precipMm: number | null
  code: number | null
}

/** The years looked back over. */
export const CLIMATE_YEARS = 3
/** Days either side of the date that count as "the same time of year". */
export const WINDOW_DAYS = 3
/** The archive trails today by about five days; a week is safe. */
const ARCHIVE_LAG_DAYS = 7
/** A day with this much or more is a wet day. */
const WET_MM = 1
/** Fewer days than this with a temperature says too little to call typical. */
const MIN_SAMPLES = 5
const TTL_MS = 30 * 24 * 60 * 60_000
const DEADLINE = "12 seconds"
const STORE_PREFIX = "trips-climate-v1:"

// ── Dates ────────────────────────────────────────────────────────────────

/** The same calendar date `years` from `iso` (negative: back). 29 February lands on the 28th in a common year. */
export function shiftYears(iso: string, years: number): string {
  const year = Number(iso.slice(0, 4)) + years
  const md = iso.slice(5)
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return `${String(year).padStart(4, "0")}-${md === "02-29" && !leap ? "02-28" : md}`
}

/**
 * How many years back to sample a stretch ending `end`: the three most recent
 * years whose window has already reached the archive. Usually 1, 2 and 3; a
 * trip more than a year out skips the years that have not happened yet.
 */
export function sampleYears(end: string, today: string): number[] {
  const latest = addDays(today, -ARCHIVE_LAG_DAYS)
  let back = 1
  while (addDays(shiftYears(end, -back), WINDOW_DAYS) > latest) back += 1
  return Array.from({ length: CLIMATE_YEARS }, (_, i) => back + i)
}

// ── Aggregation (pure) ───────────────────────────────────────────────────

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * The most common sky among the codes (driest first on a tie, so a tie
 * between sun and rain does not read as a wet spell), then that sky's most
 * common code (the lowest on a tie). Null without a code.
 */
export function commonSky(codes: readonly number[]): number | null {
  if (codes.length === 0) return null
  const bySky = new Map<SkyId, number[]>()
  for (const code of codes) {
    const sky = wmoSky(code).sky
    bySky.set(sky, [...(bySky.get(sky) ?? []), code])
  }
  const sky = SKY_ORDER.reduce<SkyId | null>((best, s) => ((bySky.get(s)?.length ?? 0) > (best ? bySky.get(best)!.length : 0) ? s : best), null)!
  const counts = new Map<number, number>()
  for (const code of bySky.get(sky)!) counts.set(code, (counts.get(code) ?? 0) + 1)
  return [...counts].sort(([c1, n1], [c2, n2]) => n2 - n1 || c1 - c2)[0]![0]
}

/** One year's archive for a place, `back` years before the trip. */
export interface ClimateYear {
  back: number
  rows: readonly ClimateSample[]
}

/**
 * What `date` is typically like, from the archive years around it: each
 * year's days within WINDOW_DAYS of the same date. Medians for the
 * temperatures, the share of wet days, the most common sky. Null when too
 * few days had a temperature.
 */
export function typicalDay(date: string, years: readonly ClimateYear[]): TypicalDay | null {
  const highs: number[] = []
  const lows: number[] = []
  const codes: number[] = []
  let measured = 0
  let wet = 0
  let sampledYears = 0
  for (const year of years) {
    const centre = shiftYears(date, -year.back)
    const near = year.rows.filter((row) => Math.abs(daysBetween(centre, row.date)) <= WINDOW_DAYS)
    let any = false
    for (const row of near) {
      if (row.highC !== null && row.lowC !== null) {
        highs.push(row.highC)
        lows.push(row.lowC)
        any = true
      }
      if (row.precipMm !== null) {
        measured += 1
        if (row.precipMm >= WET_MM) wet += 1
      }
      if (row.code !== null) codes.push(row.code)
    }
    if (any) sampledYears += 1
  }
  if (highs.length < MIN_SAMPLES) return null
  return {
    date,
    highC: median(highs),
    lowC: median(lows),
    rainChance: measured ? Math.round((wet / measured) * 100) : 0,
    code: commonSky(codes) ?? 3,
    years: sampledYears,
  }
}

// ── Words ────────────────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "early March", "mid July", "late December": the time of year a date falls in. */
export function timeOfYear(date: string): string {
  const day = Number(date.slice(8, 10))
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late"
  return `${part} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ""}`
}

/** How a sky is usually put when it is what most of the days were like. */
const USUAL: Record<SkyId, string> = {
  clear: "Mostly clear",
  "partly-cloudy": "Sun and cloud",
  cloudy: "Mostly grey",
  fog: "Often foggy",
  drizzle: "Often drizzly",
  rain: "Often rainy",
  showers: "Often showery",
  snow: "Often snowy",
  thunder: "Often stormy",
}

/**
 * The typical sky and how often it is wet, in words that cannot pass for a
 * forecast: "Mostly grey", "Rain on 4 days in 10". Wet days are named from 30%;
 * under 10% the dryness is worth saying.
 */
export function typicalWords(day: Pick<TypicalDay, "code" | "rainChance">): { sky: string; wet: string | null } {
  const sky = wmoSky(day.code).sky
  const tenths = Math.round(day.rainChance / 10)
  const what = sky === "snow" ? "Snow or rain" : "Rain"
  const wet = day.rainChance >= 30 ? (tenths >= 8 ? `${what} most days` : `${what} on ${tenths} days in 10`) : day.rainChance < 10 ? "Seldom wet" : null
  return { sky: USUAL[sky], wet }
}

interface ArchiveDaily {
  time?: string[]
  weather_code?: (number | null)[]
  temperature_2m_max?: (number | null)[]
  temperature_2m_min?: (number | null)[]
  precipitation_sum?: (number | null)[]
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)

/** The archive's daily columns as rows; a row with nothing usable is dropped. */
export function readArchive(daily: ArchiveDaily | undefined): ClimateSample[] {
  const out: ClimateSample[] = []
  daily?.time?.forEach((date, i) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const row = {
      date,
      highC: num(daily.temperature_2m_max?.[i]),
      lowC: num(daily.temperature_2m_min?.[i]),
      precipMm: num(daily.precipitation_sum?.[i]),
      code: num(daily.weather_code?.[i]),
    }
    if (row.highC !== null || row.precipMm !== null || row.code !== null) out.push(row)
  })
  return out
}

// ── Requests ─────────────────────────────────────────────────────────────

/** A place's stretch of the trip, with the years it is sampled over. */
export interface ClimatePlan {
  /** Cache identity: the place, the stretch and the years. */
  id: string
  group: ForecastRequest
  backs: number[]
}

export function climatePlan(group: ForecastRequest, today: string): ClimatePlan {
  const backs = sampleYears(group.end, today)
  return { id: `${group.key}:${group.start}:${group.end}:${backs.join("/")}`, group, backs }
}

/** The archive places to ask for: one per plan and year, each with its own dates. */
export function archivePlaces(plans: readonly ClimatePlan[]): OpenMeteoPlace[] {
  return plans.flatMap((plan) =>
    plan.backs.map((back) => ({
      lat: plan.group.lat,
      lng: plan.group.lng,
      start: addDays(shiftYears(plan.group.start, -back), -WINDOW_DAYS),
      end: addDays(shiftYears(plan.group.end, -back), WINDOW_DAYS),
    })),
  )
}

/** date → typical weather, for every date in the plan's stretch (so a day moved within it is covered too). */
export type TypicalByDate = ReadonlyMap<string, TypicalDay>

function typicalStretch(plan: ClimatePlan, years: readonly ClimateYear[]): TypicalByDate {
  const out = new Map<string, TypicalDay>()
  for (let date = plan.group.start; date <= plan.group.end; date = addDays(date, 1)) {
    const typical = typicalDay(date, years)
    if (typical) out.set(date, typical)
  }
  return out
}

const fetchArchiveEffect = Effect.fn("Climate.fetch")(function* (plans: readonly ClimatePlan[], signal?: AbortSignal) {
  const places = archivePlaces(plans)
  const url =
    `https://archive-api.open-meteo.com/v1/archive?${placesQuery(places)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
  const res = yield* fetchExternal(url, { signal }).pipe(
    Effect.timeoutFail({ duration: DEADLINE, onTimeout: () => new TimeoutError({ message: "The weather history took too long" }) }),
  )
  yield* requireOk(res)
  const body = yield* parseJson<{ daily?: ArchiveDaily } | Array<{ daily?: ArchiveDaily }>>(res)
  const answers = perPlace(body, places.length)
  // `archivePlaces` lists each plan's years in turn, so the answers come back in that order.
  let at = 0
  return plans.map((plan) => typicalStretch(plan, plan.backs.map((back) => ({ back, rows: readArchive(answers[at++]?.daily) }))))
})

// ── Cache ────────────────────────────────────────────────────────────────

const memory = new Map<string, { at: number; byDate: TypicalByDate }>()

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

/** A typical day as stored: checked field by field, since storage is outside the program. */
function cleanTypical(value: unknown): TypicalDay | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  const [highC, lowC, rainChance, code, years] = [num(v.highC), num(v.lowC), num(v.rainChance), num(v.code), num(v.years)]
  if (typeof v.date !== "string" || highC === null || lowC === null || rainChance === null || code === null || years === null) return null
  return { date: v.date, highC, lowC, rainChance: Math.min(100, Math.max(0, rainChance)), code, years }
}

function readCached(id: string): TypicalByDate | null {
  const now = Date.now()
  const hit = memory.get(id)
  if (hit && now - hit.at < TTL_MS) return hit.byDate
  try {
    const raw = storage()?.getItem(STORE_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: unknown; days?: unknown }
    if (typeof parsed.at !== "number" || now - parsed.at >= TTL_MS || !Array.isArray(parsed.days)) return null
    const byDate = new Map(parsed.days.map(cleanTypical).filter((d): d is TypicalDay => d !== null).map((d) => [d.date, d]))
    memory.set(id, { at: parsed.at, byDate })
    return byDate
  } catch {
    return null
  }
}

/** When a stored entry was written; null when it is not one of ours. */
function storedAt(raw: string | null): number | null {
  try {
    const at = raw ? (JSON.parse(raw) as { at?: unknown }).at : null
    return typeof at === "number" ? at : null
  } catch {
    return null
  }
}

function writeCached(id: string, byDate: TypicalByDate, now: number) {
  memory.set(id, { at: now, byDate })
  try {
    const store = storage()
    if (!store) return
    // Drop what has gone stale first, so trips edited over months do not pile up.
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i)
      if (!key?.startsWith(STORE_PREFIX)) continue
      const at = storedAt(store.getItem(key))
      if (at === null || now - at >= TTL_MS) store.removeItem(key)
    }
    store.setItem(STORE_PREFIX + id, JSON.stringify({ at: now, days: [...byDate.values()] }))
  } catch {
    // Full or blocked storage: the memory copy still serves this visit.
  }
}

/** Typical weather for each plan, in order. Rejects when the archive fails; nothing failed is kept. */
async function loadClimate(plans: readonly ClimatePlan[], signal: AbortSignal): Promise<TypicalByDate[]> {
  const answers = await runPromise(fetchArchiveEffect(plans, signal))
  const now = Date.now()
  plans.forEach((plan, i) => writeCached(plan.id, answers[i] ?? new Map(), now))
  return answers
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface Climate {
  /** dayId → its date's typical weather. */
  typical: ReadonlyMap<string, TypicalDay>
  /** Days whose history has been asked for and has not answered yet. */
  pending: ReadonlySet<string>
}

const NO_DAYS: ReadonlyMap<string, TypicalDay> = new Map()
const NO_IDS: ReadonlySet<string> = new Set()

/**
 * The typical weather for the trip's days past the forecast's reach (`groups`,
 * from `placeGroups`). Read from the cache during render when it has them, so
 * a revisit shows them at once; otherwise one archive request for every place
 * not cached. A failed request leaves those days without (the plan's own
 * weather, if any, shows instead) and is asked again on the next visit.
 */
export function useClimate(groups: readonly ForecastRequest[], today: string): Climate {
  const plans = useMemo(() => groups.map((group) => climatePlan(group, today)), [groups, today])
  const planIds = plans.map((plan) => plan.id).join(";")
  const cached = useMemo(() => {
    const hits = new Map<string, TypicalByDate>()
    for (const plan of plans) {
      const hit = readCached(plan.id)
      if (hit) hits.set(plan.id, hit)
    }
    return hits
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `planIds` is the identity of `plans`
  }, [planIds])
  const asking = plans.filter((plan) => !cached.has(plan.id))
  const askingId = asking.map((plan) => plan.id).join(";")
  const [loaded, setLoaded] = useState<{ id: string; byPlan: ReadonlyMap<string, TypicalByDate> }>({ id: "", byPlan: new Map() })

  useEffect(() => {
    if (!askingId) return
    const controller = new AbortController()
    void loadClimate(asking, controller.signal).then(
      (answers) => {
        if (!controller.signal.aborted) setLoaded({ id: askingId, byPlan: new Map(asking.map((plan, i) => [plan.id, answers[i] ?? new Map()])) })
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ id: askingId, byPlan: new Map() })
      },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `askingId` is the identity of `asking`
  }, [askingId])

  return useMemo(() => {
    if (plans.length === 0) return { typical: NO_DAYS, pending: NO_IDS }
    const answered = loaded.id === askingId
    const typical = new Map<string, TypicalDay>()
    const pending = new Set<string>()
    for (const plan of plans) {
      const byDate = cached.get(plan.id) ?? (answered ? loaded.byPlan.get(plan.id) : undefined)
      for (const [dayId, date] of plan.group.days) {
        const day = byDate?.get(date)
        if (day) typical.set(dayId, day)
        else if (!byDate && !answered) pending.add(dayId)
      }
    }
    return { typical, pending }
  }, [plans, cached, loaded, askingId])
}

/** Test seam: forget what was fetched this session. */
export function forgetClimate() {
  memory.clear()
}
