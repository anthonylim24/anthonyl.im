import { useEffect, useMemo, useState } from "react"
import { Effect } from "effect"
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, CloudSunRain, Snowflake, Sun, type LucideIcon } from "lucide-react"
import { fetchExternal, parseJson } from "../../effect/http"
import { TimeoutError } from "../../effect/errors"
import { runPromise } from "../../effect/runtime"
import { addDays, todayIsoIn } from "./meta"
import { dayRoute } from "./map/geo"
import { useClimate, type TypicalDay } from "./climate"
import { perPlace, placesQuery } from "./openMeteo"
import { wmoSky, type SkyId } from "./wmo"
import type { Trip, TripDay } from "./types"
import clearArt from "./art/sky-clear.webp"
import partlyCloudyArt from "./art/sky-partly-cloudy.webp"
import cloudyArt from "./art/sky-cloudy.webp"
import fogArt from "./art/sky-fog.webp"
import drizzleArt from "./art/sky-drizzle.webp"
import rainArt from "./art/sky-rain.webp"
import showersArt from "./art/sky-showers.webp"
import snowArt from "./art/sky-snow.webp"
import thunderArt from "./art/sky-thunder.webp"

// Live daily forecast for the days Open-Meteo covers (today and the next 15),
// read at each day's own place, every place in one request. Keyless and
// best-effort: a failure shows nothing, and the AI's `day.weather` (if any)
// stays the fallback. Days past the forecast's reach get the weather typical
// of their dates instead (`climate.ts`), always set apart from a forecast.

export type { SkyId } from "./wmo"
export type { TypicalDay } from "./climate"

export interface DayForecast {
  date: string
  highC: number
  lowC: number
  /** Highest chance of precipitation that day, 0–100. */
  rainChance: number
  /** WMO weather code. */
  code: number
  /** "HH:mm" at the place, when Open-Meteo knows them (not past the poles). */
  sunrise?: string
  sunset?: string
  /** The day hour by hour, at the place. */
  hours?: HourForecast[]
}

export interface HourForecast {
  /** "HH:mm" at the place. */
  time: string
  tempC: number
  /** Chance of precipitation that hour, 0–100. */
  rainChance: number
  code: number
}

export interface ForecastRequest {
  key: string
  lat: number
  lng: number
  start: string
  end: string
  /** dayId → date, the days this request answers. */
  days: Map<string, string>
}

/** Open-Meteo forecasts today plus 15 days. */
export const FORECAST_DAYS = 16
const TTL_MS = 30 * 60_000
/** A forecast that has not come by then is not coming. */
const DEADLINE = "10 seconds"

/** One decimal (~11 km): days in the same city share a place. */
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The places that cover this trip's days from `from` to `to` (ISO dates,
 * inclusive; `to` null for no end). A day is read at its first pinned stop,
 * else at the day before's place, else the trip's centre; days whose places
 * round to the same point share one entry.
 */
export function placeGroups(trip: Pick<Trip, "days" | "center">, from: string, to: string | null): ForecastRequest[] {
  const groups = new Map<string, ForecastRequest>()
  let carry = trip.center ? { lat: trip.center.lat, lng: trip.center.lng } : null
  for (const day of trip.days) {
    const first = dayRoute(day)[0]
    if (first) carry = first
    if (!carry || day.date < from || (to !== null && day.date > to)) continue
    const lat = round1(carry.lat)
    const lng = round1(carry.lng)
    const key = `${lat},${lng}`
    const group = groups.get(key)
    if (group) {
      group.days.set(day.id, day.date)
      if (day.date < group.start) group.start = day.date
      if (day.date > group.end) group.end = day.date
    } else {
      groups.set(key, { key, lat, lng, start: day.date, end: day.date, days: new Map([[day.id, day.date]]) })
    }
  }
  return [...groups.values()]
}

/** The places that cover this trip's forecastable days (today and the next 15). */
export function forecastRequests(trip: Pick<Trip, "days" | "center">, today: string): ForecastRequest[] {
  return placeGroups(trip, today, addDays(today, FORECAST_DAYS - 1))
}

/**
 * Each sky has a small glyph for tight rows and an engraving for the day header:
 * `art` is its lines as an alpha mask, inked in the theme's secondary ink (dark
 * lines on light paper, light lines on dark, like a white-line engraving).
 */
export const SKIES: Record<SkyId, { icon: LucideIcon; art: string }> = {
  clear: { icon: Sun, art: clearArt },
  "partly-cloudy": { icon: CloudSun, art: partlyCloudyArt },
  cloudy: { icon: Cloud, art: cloudyArt },
  fog: { icon: CloudFog, art: fogArt },
  drizzle: { icon: CloudDrizzle, art: drizzleArt },
  rain: { icon: CloudRain, art: rainArt },
  showers: { icon: CloudSunRain, art: showersArt },
  snow: { icon: Snowflake, art: snowArt },
  thunder: { icon: CloudLightning, art: thunderArt },
}

export interface Kind {
  word: string
  sky: SkyId
  icon: LucideIcon
  art: string
}

/** WMO code → a word, a glyph and an engraving. */
export function weatherKind(code: number): Kind {
  const { word, sky } = wmoSky(code)
  return { word, sky, ...SKIES[sky] }
}

/** Words in a written forecast (the AI's "Light rain, mild") → the nearest sky. */
const WORDS: ReadonlyArray<readonly [RegExp, SkyId]> = [
  [/thunder|storm|lightning/i, "thunder"],
  [/snow|sleet|flurr/i, "snow"],
  [/shower/i, "showers"],
  [/drizzle/i, "drizzle"],
  [/rain|wet|monsoon/i, "rain"],
  [/fog|mist|haz/i, "fog"],
  [/partly|scattered|sun and cloud|mixed/i, "partly-cloudy"],
  [/overcast|cloud|grey|gray/i, "cloudy"],
  [/clear|sun|fine|bright|hot|warm/i, "clear"],
]

export function skyFromText(text: string): SkyId {
  return WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "cloudy"
}

/**
 * What the day header shows about the sky: the live forecast; for a day out
 * of its reach, the weather typical of that date (history), else the AI's
 * expected weather; a reserved place while either is on its way; or nothing.
 */
export type DaySky =
  | { status: "forecast"; forecast: DayForecast }
  /** Past the forecast's reach: what the same dates were like in recent years. Never a forecast. */
  | { status: "typical"; typical: TypicalDay }
  | { status: "expected"; highC: number; lowC: number; word: string; sky: SkyId }
  | { status: "loading" }
  /** In the forecast's reach, but the forecast did not come. */
  | { status: "unavailable"; retry?: () => void }
  | { status: "none" }

/**
 * The live forecast first. Past its reach, the measured history of the date
 * beats the plan's guess; the guess shows only once the history has not come
 * (or has no data for the place).
 */
export function daySky(day: Pick<TripDay, "id" | "weather">, forecasts: Forecasts): DaySky {
  const live = forecasts.byDay.get(day.id)
  if (live) return { status: "forecast", forecast: live }
  const typical = forecasts.typical?.get(day.id)
  if (typical) return { status: "typical", typical }
  if (forecasts.pending.has(day.id)) return { status: "loading" }
  if (day.weather) {
    const { highC, lowC, condition } = day.weather
    return { status: "expected", highC, lowC, word: condition, sky: skyFromText(condition) }
  }
  return forecasts.missing.has(day.id) ? { status: "unavailable", retry: forecasts.retry } : { status: "none" }
}

/** "HH:mm" → minutes from midnight. */
const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))

export interface WetSpell {
  /** [from, to) in minutes from the day's midnight. */
  from: number
  to: number
  /** The highest chance in the spell, 0–100. */
  chance: number
  /** The WMO code of its wettest hour: says whether it is rain, showers or snow. */
  code: number
}

/** The stretches of the day when rain (or snow) is likely. */
export function wetSpells(hours: readonly HourForecast[], threshold = 50): WetSpell[] {
  const spells: WetSpell[] = []
  for (const hour of hours) {
    if (hour.rainChance < threshold) continue
    const at = minutesOf(hour.time)
    const last = spells[spells.length - 1]
    if (last && last.to === at) {
      last.to = at + 60
      if (hour.rainChance > last.chance) {
        last.chance = hour.rainChance
        last.code = hour.code
      }
    } else spells.push({ from: at, to: at + 60, chance: hour.rainChance, code: hour.code })
  }
  return spells
}

/** What falls: "Snow", "Showers", "Rain". A dry code (the hour is only likely wet) says "Rain". */
export function wetWord(code: number): string {
  const { sky } = weatherKind(code)
  if (sky === "snow") return "Snow"
  if (sky === "showers") return "Showers"
  if (sky === "drizzle") return "Drizzle"
  if (sky === "thunder") return "Storms"
  return "Rain"
}

/** Rain that should change the plan, not just be noted: 70% or more, or any storm. */
export const soaking = (spell: Pick<WetSpell, "chance" | "code">) => spell.chance >= 70 || weatherKind(spell.code).sky === "thunder"

/** The wettest spell that touches [from, to), if any. */
export function wetDuring(spells: readonly WetSpell[], from: number, to: number): WetSpell | null {
  let wettest: WetSpell | null = null
  for (const spell of spells) if (spell.from < to && spell.to > from && (!wettest || spell.chance > wettest.chance)) wettest = spell
  return wettest
}

/** Fahrenheit where it is the everyday scale. */
export function prefersFahrenheit(locale: string | undefined): boolean {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase()
  return region === "US" || region === "LR" || region === "MM" || region === "BS" || region === "KY" || region === "PW"
}

export function formatTemp(celsius: number, fahrenheit: boolean): string {
  return `${Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius)}°`
}

const WET = new Set(["Drizzle", "Rain", "Showers", "Snow", "Thunderstorms"])

/** "24° / 17° · Rain 70%": the chance only when it is worth a look. */
export function forecastLine(f: DayForecast, fahrenheit: boolean): string {
  const word = weatherKind(f.code).word
  const chance = f.rainChance >= 30 ? (WET.has(word) ? ` ${f.rainChance}%` : ` · ${f.rainChance}% rain`) : ""
  return `${formatTemp(f.highC, fahrenheit)} / ${formatTemp(f.lowC, fahrenheit)} · ${word}${chance}`
}

interface OpenMeteoDaily {
  time?: string[]
  weather_code?: number[]
  temperature_2m_max?: (number | null)[]
  temperature_2m_min?: (number | null)[]
  precipitation_probability_max?: (number | null)[]
  sunrise?: (string | null)[]
  sunset?: (string | null)[]
}

interface OpenMeteoHourly {
  time?: string[]
  temperature_2m?: (number | null)[]
  precipitation_probability?: (number | null)[]
  weather_code?: (number | null)[]
}

/** "2026-07-10T06:12" → "06:12". */
const clockOf = (stamp: string | null | undefined) => (stamp && /T\d\d:\d\d/.test(stamp) ? stamp.slice(11, 16) : undefined)

/** date → that day's hours, dropping hours with no temperature. */
function readHourly(hourly: OpenMeteoHourly | undefined): Map<string, HourForecast[]> {
  const byDate = new Map<string, HourForecast[]>()
  hourly?.time?.forEach((stamp, i) => {
    const temp = hourly.temperature_2m?.[i]
    const time = clockOf(stamp)
    if (typeof temp !== "number" || !time) return
    const date = stamp.slice(0, 10)
    const hours = byDate.get(date) ?? []
    hours.push({ time, tempC: temp, rainChance: hourly.precipitation_probability?.[i] ?? 0, code: hourly.weather_code?.[i] ?? 3 })
    byDate.set(date, hours)
  })
  return byDate
}

/** Rows with a missing temperature are dropped rather than shown as 0°. */
export function readDaily(daily: OpenMeteoDaily | undefined, hourly?: OpenMeteoHourly): DayForecast[] {
  if (!daily?.time) return []
  const hoursByDate = readHourly(hourly)
  const out: DayForecast[] = []
  daily.time.forEach((date, i) => {
    const high = daily.temperature_2m_max?.[i]
    const low = daily.temperature_2m_min?.[i]
    if (typeof high !== "number" || typeof low !== "number") return
    const sunrise = clockOf(daily.sunrise?.[i])
    const sunset = clockOf(daily.sunset?.[i])
    const hours = hoursByDate.get(date)
    out.push({
      date,
      highC: high,
      lowC: low,
      rainChance: daily.precipitation_probability_max?.[i] ?? 0,
      code: daily.weather_code?.[i] ?? 3,
      ...(sunrise ? { sunrise } : {}),
      ...(sunset ? { sunset } : {}),
      ...(hours?.length ? { hours } : {}),
    })
  })
  return out
}

const fetchForecastEffect = Effect.fn("Forecast.fetch")(function* (reqs: readonly ForecastRequest[], signal?: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast?${placesQuery(reqs)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&timezone=auto`
  const res = yield* fetchExternal(url, { signal }).pipe(
    Effect.timeoutFail({ duration: DEADLINE, onTimeout: () => new TimeoutError({ message: "The forecast took too long" }) }),
  )
  if (!res.ok) return reqs.map(() => [] as DayForecast[])
  type Place = { daily?: OpenMeteoDaily; hourly?: OpenMeteoHourly }
  const body = yield* parseJson<Place | Place[]>(res)
  return perPlace(body, reqs.length).map((place) => readDaily(place?.daily, place?.hourly))
})

const cache = new Map<string, { at: number; rows: DayForecast[] }>()

const cacheId = (req: ForecastRequest) => `${req.key}:${req.start}:${req.end}`

function fresh(req: ForecastRequest): DayForecast[] | null {
  const hit = cache.get(cacheId(req))
  return hit && Date.now() - hit.at < TTL_MS ? hit.rows : null
}

/** Each request's rows, in order: fresh ones from the cache, every other place in one request. */
async function loadForecasts(reqs: readonly ForecastRequest[], signal: AbortSignal): Promise<DayForecast[][]> {
  const ask = reqs.filter((req) => !fresh(req))
  const answers = ask.length ? await runPromise(fetchForecastEffect(ask, signal)) : []
  const asked = new Map(ask.map((req, i) => [req, answers[i] ?? []]))
  // A failed or empty answer is not kept, so trying again asks the service again.
  for (const [req, rows] of asked) if (rows.length) cache.set(cacheId(req), { at: Date.now(), rows })
  return reqs.map((req) => asked.get(req) ?? fresh(req) ?? [])
}

export interface Forecasts {
  /** dayId → that day's live forecast, for the days that have one. Live only, never the typical weather. */
  byDay: ReadonlyMap<string, DayForecast>
  /**
   * dayId → the weather typical of its date, for days past the forecast's
   * reach that have it. Optional so a literal written before it existed still types.
   */
  typical?: ReadonlyMap<string, TypicalDay>
  /** Days a forecast (or their typical weather) has been asked for and has not answered yet. */
  pending: ReadonlySet<string>
  /** Days in the forecast's reach that it did not answer (the service failed or had no row). */
  missing: ReadonlySet<string>
  /** Ask again for the days that are missing. */
  retry?: () => void
}

export function useForecast(trip: Pick<Trip, "days" | "center" | "timezone"> | null): Forecasts {
  const today = trip ? todayIsoIn(trip.timezone) : ""
  const requests = useMemo(() => (trip ? forecastRequests(trip, today) : []), [trip, today])
  // Past the forecast's reach, the history of the date: its own request and
  // state, so a slow archive never holds up the forecast, and a failed one
  // never marks a far day as a missing forecast.
  const beyond = useMemo(() => (trip ? placeGroups(trip, addDays(today, FORECAST_DAYS), null) : []), [trip, today])
  const climate = useClimate(beyond, today)
  // Only a change of place or dates refetches, not every edit to a stop.
  const signature = requests.map((r) => `${r.key}:${r.start}:${r.end}:${[...r.days.keys()].join("|")}`).join(";")
  const [loaded, setLoaded] = useState<{ signature: string; byDay: ReadonlyMap<string, DayForecast> }>({ signature: "", byDay: NONE })
  const [attempt, setAttempt] = useState(0)
  const asking = `${signature}#${attempt}`

  useEffect(() => {
    if (!requests.length) return
    const controller = new AbortController()
    void loadForecasts(requests, controller.signal)
      .catch(() => requests.map(() => [] as DayForecast[]))
      .then((answers) => {
        if (controller.signal.aborted) return
        const byDay = new Map<string, DayForecast>()
        requests.forEach((req, i) => {
          const byDate = new Map((answers[i] ?? []).map((row) => [row.date, row]))
          for (const [dayId, date] of req.days) {
            const row = byDate.get(date)
            if (row) byDay.set(dayId, row)
          }
        })
        setLoaded({ signature: asking, byDay })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `asking` is the identity of `requests` and the attempt
  }, [asking])

  const live = useMemo((): Forecasts => {
    const asked = requests.flatMap((req) => [...req.days.keys()])
    if (loaded.signature === asking) {
      const missing = new Set(asked.filter((id) => !loaded.byDay.has(id)))
      return { byDay: loaded.byDay, pending: EMPTY, missing, retry: missing.size ? () => setAttempt((n) => n + 1) : undefined }
    }
    // Trying again keeps the days that did answer and holds the place of the rest.
    if (loaded.signature.startsWith(`${signature}#`)) return { byDay: loaded.byDay, pending: new Set(asked.filter((id) => !loaded.byDay.has(id))), missing: EMPTY }
    return { byDay: NONE, pending: new Set(asked), missing: EMPTY }
  }, [loaded, asking, signature, requests])

  return useMemo(
    () => ({
      ...live,
      typical: climate.typical,
      pending: climate.pending.size ? new Set([...live.pending, ...climate.pending]) : live.pending,
    }),
    [live, climate],
  )
}

const NONE: ReadonlyMap<string, DayForecast> = new Map()
const EMPTY: ReadonlySet<string> = new Set()

export const FAHRENHEIT = typeof navigator !== "undefined" && prefersFahrenheit(navigator.language)
