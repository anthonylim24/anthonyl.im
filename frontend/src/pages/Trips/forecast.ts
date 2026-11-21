import { useEffect, useMemo, useState } from "react"
import { Effect } from "effect"
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from "lucide-react"
import { fetchExternal, parseJson } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { addDays, todayIsoIn } from "./meta"
import { dayRoute } from "./map/geo"
import type { Trip } from "./types"

// Live daily forecast for the days Open-Meteo covers (today and the next 15),
// read at each day's own place. Keyless and best-effort: a failure shows
// nothing, and the AI's `day.weather` (if any) stays the fallback.

export interface DayForecast {
  date: string
  highC: number
  lowC: number
  /** Highest chance of precipitation that day, 0–100. */
  rainChance: number
  /** WMO weather code. */
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
const MAX_REQUESTS = 6
const TTL_MS = 30 * 60_000

/** One decimal (~11 km): days in the same city share a request. */
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The requests that cover this trip's forecastable days. A day is read at its
 * first pinned stop, else at the day before's place, else the trip's centre;
 * days whose places round to the same point share one request.
 */
export function forecastRequests(trip: Pick<Trip, "days" | "center">, today: string): ForecastRequest[] {
  const last = addDays(today, FORECAST_DAYS - 1)
  const groups = new Map<string, ForecastRequest>()
  let carry = trip.center ? { lat: trip.center.lat, lng: trip.center.lng } : null
  for (const day of trip.days) {
    const first = dayRoute(day)[0]
    if (first) carry = first
    if (!carry || day.date < today || day.date > last) continue
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
  return [...groups.values()].slice(0, MAX_REQUESTS)
}

type Kind = { word: string; icon: LucideIcon }

/** WMO code → a word and an icon. */
export function weatherKind(code: number): Kind {
  if (code === 0) return { word: "Clear", icon: Sun }
  if (code <= 2) return { word: "Partly cloudy", icon: CloudSun }
  if (code === 3) return { word: "Overcast", icon: Cloud }
  if (code === 45 || code === 48) return { word: "Fog", icon: CloudFog }
  if (code >= 51 && code <= 57) return { word: "Drizzle", icon: CloudDrizzle }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { word: code >= 80 ? "Showers" : "Rain", icon: CloudRain }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { word: "Snow", icon: CloudSnow }
  if (code >= 95) return { word: "Thunderstorms", icon: CloudLightning }
  return { word: "Cloudy", icon: Cloud }
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
}

/** Rows with a missing temperature are dropped rather than shown as 0°. */
export function readDaily(daily: OpenMeteoDaily | undefined): DayForecast[] {
  if (!daily?.time) return []
  const out: DayForecast[] = []
  daily.time.forEach((date, i) => {
    const high = daily.temperature_2m_max?.[i]
    const low = daily.temperature_2m_min?.[i]
    if (typeof high !== "number" || typeof low !== "number") return
    out.push({
      date,
      highC: high,
      lowC: low,
      rainChance: daily.precipitation_probability_max?.[i] ?? 0,
      code: daily.weather_code?.[i] ?? 3,
    })
  })
  return out
}

const fetchForecastEffect = Effect.fn("Forecast.fetch")(function* (req: ForecastRequest, signal?: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${req.lat}&longitude=${req.lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${req.start}&end_date=${req.end}`
  const res = yield* fetchExternal(url, { signal })
  if (!res.ok) return [] as DayForecast[]
  const body = yield* parseJson<{ daily?: OpenMeteoDaily }>(res)
  return readDaily(body.daily)
})

const cache = new Map<string, { at: number; rows: DayForecast[] }>()

async function loadForecast(req: ForecastRequest, signal: AbortSignal): Promise<DayForecast[]> {
  const id = `${req.key}:${req.start}:${req.end}`
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows
  const rows = await runPromise(fetchForecastEffect(req, signal))
  cache.set(id, { at: Date.now(), rows })
  return rows
}

/** dayId → that day's live forecast, for the days that have one. */
export function useForecast(trip: Pick<Trip, "days" | "center" | "timezone"> | null): ReadonlyMap<string, DayForecast> {
  const today = trip ? todayIsoIn(trip.timezone) : ""
  const requests = useMemo(() => (trip ? forecastRequests(trip, today) : []), [trip, today])
  // Only a change of place or dates refetches, not every edit to a stop.
  const signature = requests.map((r) => `${r.key}:${r.start}:${r.end}:${[...r.days.keys()].join("|")}`).join(";")
  const [loaded, setLoaded] = useState<{ signature: string; byDay: ReadonlyMap<string, DayForecast> }>({ signature: "", byDay: NONE })

  useEffect(() => {
    if (!requests.length) return
    const controller = new AbortController()
    void Promise.all(requests.map((req) => loadForecast(req, controller.signal).then((rows) => ({ req, rows })).catch(() => null))).then(
      (results) => {
        if (controller.signal.aborted) return
        const byDay = new Map<string, DayForecast>()
        for (const result of results) {
          if (!result) continue
          const byDate = new Map(result.rows.map((row) => [row.date, row]))
          for (const [dayId, date] of result.req.days) {
            const row = byDate.get(date)
            if (row) byDay.set(dayId, row)
          }
        }
        setLoaded({ signature, byDay })
      },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` is the identity of `requests`
  }, [signature])

  return loaded.signature === signature ? loaded.byDay : NONE
}

const NONE: ReadonlyMap<string, DayForecast> = new Map()

export const FAHRENHEIT = typeof navigator !== "undefined" && prefersFahrenheit(navigator.language)
