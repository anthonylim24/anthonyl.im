/**
 * Capture a trip's day view for design review: a Kyoto fixture trip that
 * starts today (in Kyoto), with a full first day (overlaps, legs, free time,
 * a now line, Anytime stops) and Open-Meteo answered from a fixture so the
 * nine days show the nine skies the forecast knows.
 *
 * Requires the API (TRIPS_STORE=memory) and Vite with matching
 * IG_DEV_BEARER / VITE_DEV_BEARER. Usage:
 *   node scripts/capture-day.mjs <out-dir>
 *   CAPTURE_ONLY=desktop-light node scripts/capture-day.mjs <out-dir>
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const BEARER = process.env.VITE_DEV_BEARER ?? "codex-dev-bearer"
const OUT = process.argv[2] ?? "screenshots/day"
const ZONE = "Asia/Tokyo"
await mkdir(OUT, { recursive: true })

const isoIn = (date, zone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(date)
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const START = isoIn(new Date(), ZONE)
// 2:10 PM in Kyoto on the first day: between lunch and the Gion walk.
const NOW = new Date(`${START}T14:10:00+09:00`)

/** The nine skies, one a day: Clear … Thunderstorms. */
const SKIES = [
  { code: 81, hi: 15, lo: 8, rain: 60 },
  { code: 0, hi: 17, lo: 8, rain: 0 },
  { code: 2, hi: 16, lo: 9, rain: 10 },
  { code: 3, hi: 14, lo: 9, rain: 20 },
  { code: 45, hi: 12, lo: 7, rain: 10 },
  { code: 53, hi: 13, lo: 9, rain: 45 },
  { code: 63, hi: 12, lo: 8, rain: 85 },
  { code: 73, hi: 3, lo: -2, rain: 70 },
  { code: 95, hi: 21, lo: 15, rain: 90 },
]

/** A day's hours: coolest before dawn, warmest at two, wet in the afternoon on wet days. */
function hourly(sky) {
  return Array.from({ length: 24 }, (_, h) => {
    const warmth = (1 - Math.cos(((h - 5 + 24) % 24) / 24 * 2 * Math.PI)) / 2
    const wet = sky.rain >= 40 ? (h >= 14 && h <= 16 ? sky.rain : h === 13 || h === 17 ? sky.rain - 25 : 5) : Math.min(sky.rain, 10)
    return { temp: Math.round((sky.lo + (sky.hi - sky.lo) * warmth) * 10) / 10, rain: wet }
  })
}

const place = (name, lat, lng, category) => ({ name, lat, lng, category, source: "user", confidence: "high" })
let n = 0
const stop = (title, time, endTime, location, extra = {}) => ({
  id: `fx-${++n}`,
  kind: "place",
  title,
  ...(time ? { time } : {}),
  ...(endTime ? { endTime } : {}),
  status: "none",
  location,
  createdBy: "user",
  ...extra,
})
const booking = (title, time, endTime, location, type) =>
  stop(title, time, endTime, location, { kind: "reservation", status: "booked", reservation: { type, status: "confirmed" } })

const PLAN = [
  {
    title: "Shrines and the old town",
    items: [
      stop("Fushimi Inari Taisha", "08:00", "09:30", place("Fushimi Inari Taisha", 34.9671, 135.7727, "shrine")),
      stop("Kiyomizu-dera", "10:15", "11:30", place("Kiyomizu-dera", 34.9949, 135.785, "temple")),
      booking("Tea ceremony at Camellia Flower", "11:00", "12:00", place("Camellia Flower", 34.998, 135.781, "tea house"), "experience"),
      stop("Lunch at Nishiki Market", "12:30", "13:30", place("Nishiki Market", 35.005, 135.7649, "market")),
      stop("Gion and Hanami-koji at dusk", "15:30", "18:00", place("Hanami-koji", 35.0037, 135.7751, "neighborhood")),
      booking("Dinner at Gion Karyo", "18:30", "20:30", place("Gion Karyo", 35.0018, 135.7752, "restaurant"), "restaurant"),
      stop("Matcha at Ippodo", undefined, undefined, place("Ippodo Tea", 35.0135, 135.7666, "cafe")),
      stop("Pontocho Alley", undefined, undefined, place("Pontocho", 35.0047, 135.7707, "neighborhood")),
      stop("니넨자카와 산넨자카 골목에서 기념품 가게 구경하고 말차 아이스크림 먹기", undefined, undefined, place("Ninenzaka", 34.9981, 135.7808, "street")),
    ],
  },
  {
    title: "Arashiyama",
    items: [
      stop("Bamboo Grove", "08:30", "09:30", place("Arashiyama Bamboo Grove", 35.017, 135.6713, "park")),
      stop("% Arabica", "09:45", "10:15", place("% Arabica Arashiyama", 35.014, 135.6776, "cafe")),
      stop("Tenryu-ji", "10:30", "12:00", place("Tenryu-ji", 35.0158, 135.6737, "temple")),
    ],
  },
  { title: "Golden Pavilion", items: [stop("Kinkaku-ji", "09:00", "10:30", place("Kinkaku-ji", 35.0394, 135.7292, "temple"))] },
  { title: "A slow day", items: [] },
  { title: "Nanzen-ji", items: [stop("Nanzen-ji", "09:30", "11:00", place("Nanzen-ji", 35.011, 135.794, "temple"))] },
  { title: "Museums in the rain", items: [stop("Kyoto National Museum", "10:00", "13:00", place("Kyoto National Museum", 34.99, 135.7731, "museum"))] },
  { title: "Uji", items: [stop("Byodo-in", "10:00", "11:30", place("Byodo-in", 34.8893, 135.8077, "temple"))] },
  { title: "Kurama in the snow", items: [stop("Kurama-dera", "10:00", "12:30", place("Kurama-dera", 35.1176, 135.7707, "temple"))] },
  { title: "Last day", items: [booking("Haruka to Kansai Airport", "16:00", "17:20", place("Kyoto Station", 34.9858, 135.7588, "train station"), "train")] },
]

async function api(method, url, body) {
  const res = await fetch(`${BASE}/api/trips${url}`, {
    method,
    headers: { authorization: `Bearer ${BEARER}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

const { trip } = await api("POST", "", {
  name: "Kyoto in the leaves",
  destinations: ["Kyoto"],
  startDate: START,
  endDate: addDays(START, PLAN.length - 1),
  timezone: ZONE,
  status: "active",
  center: { lat: 35.0116, lng: 135.7681 },
})
const days = trip.days.map((day, i) => ({ ...day, city: "Kyoto", title: PLAN[i].title, items: PLAN[i].items }))
await api("PATCH", `/${trip.id}`, { days })
console.log("trip", trip.id, "from", START)

function weather(route) {
  const url = new URL(route.request().url())
  const start = url.searchParams.get("start_date")
  const end = url.searchParams.get("end_date")
  const time = []
  for (let d = start; d <= end; d = addDays(d, 1)) time.push(d)
  const sky = (d) => SKIES[Math.round((Date.parse(d) - Date.parse(START)) / 86_400_000) % SKIES.length]
  const hours = time.flatMap((d) => hourly(sky(d)).map((hour, h) => ({ ...hour, stamp: `${d}T${String(h).padStart(2, "0")}:00`, code: sky(d).code })))
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      daily: {
        time,
        weather_code: time.map((d) => sky(d).code),
        temperature_2m_max: time.map((d) => sky(d).hi),
        temperature_2m_min: time.map((d) => sky(d).lo),
        precipitation_probability_max: time.map((d) => sky(d).rain),
        sunrise: time.map((d) => `${d}T06:38`),
        sunset: time.map((d) => `${d}T16:49`),
      },
      hourly: {
        time: hours.map((h) => h.stamp),
        temperature_2m: hours.map((h) => h.temp),
        precipitation_probability: hours.map((h) => h.rain),
        weather_code: hours.map((h) => h.code),
      },
    }),
  })
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })

async function settle(p, ms = 1500) {
  await p.waitForLoadState("networkidle").catch(() => {})
  await p
    .waitForFunction(() => {
      const canvas = document.querySelector(".maplibregl-canvas")
      return !canvas || getComputedStyle(canvas.closest("[role=region]").firstElementChild).opacity === "1"
    }, null, { timeout: 30_000 })
    .catch(() => {})
  // The sky's engraving is a CSS mask: decode it so a shot never catches the empty slot.
  await p
    .evaluate(() =>
      Promise.all(
        [...document.querySelectorAll(".trips-sky-art")].map((el) => {
          const url = /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage)?.[1]
          if (!url) return null
          const img = new Image()
          img.src = url
          return img.decode().catch(() => null)
        }),
      ),
    )
    .catch(() => {})
  await p.waitForTimeout(ms)
}

const missed = []
const shot = async (p, name, opts = {}) => {
  const file = path.join(OUT, `${name}.png`)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await p.screenshot({ path: file, timeout: 60_000, ...opts })
      console.log("wrote", file)
      return
    } catch (error) {
      if (attempt === 2) {
        missed.push(name)
        console.log("missed", file, String(error).split("\n")[0])
      }
    }
  }
}

/** The whole itinerary pane: the viewport grows until nothing scrolls. */
async function tall(p, name) {
  const size = p.viewportSize()
  await p.setViewportSize({ width: size.width, height: 2600 })
  await p.waitForTimeout(900)
  await shot(p, name)
  await p.setViewportSize(size)
  await p.waitForTimeout(400)
}

async function openDay(p, tripId, dayId, view) {
  await p.goto(`${BASE}/trips/${tripId}/day/${dayId}`, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await settle(p, 1500)
  const radio = p.getByRole("radio", { name: view })
  if (view && (await radio.count())) {
    await radio.click()
    await p.waitForTimeout(800)
  }
}

async function run(label, opts) {
  const context = await browser.newContext({ ...opts, locale: "en-US", timezoneId: "America/Los_Angeles" })
  await context.route("https://api.open-meteo.com/**", weather)
  const p = await context.newPage()
  await p.clock.setFixedTime(NOW)
  const phone = Boolean(opts.isMobile)
  const day1 = trip.days[0].id

  await p.goto(`${BASE}/trips/${trip.id}`, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await settle(p, 2500)
  await shot(p, `${label}-overview`)
  await tall(p, `${label}-overview-full`)

  for (const view of ["List", "Timeline"]) {
    await openDay(p, trip.id, day1, view)
    await shot(p, `${label}-day1-${view.toLowerCase()}`)
    await tall(p, `${label}-day1-${view.toLowerCase()}-full`)
  }

  // The timeline with a stop selected, then the keyboard ring on the next one.
  await openDay(p, trip.id, day1, "Timeline")
  const gion = p.locator("[data-timeline-stop]", { hasText: "Gion and Hanami-koji" })
  if (await gion.count()) {
    await gion.click()
    await p.waitForTimeout(900)
    await gion.focus()
    await p.keyboard.press("ArrowDown")
    await p.waitForTimeout(500)
    await shot(p, `${label}-timeline-selected-focus`)
  } else missed.push(`${label}-timeline-selected-focus`)

  // Every other day's header, one sky each (day 4 is empty); in dark, three of them.
  for (let i = 1; i < trip.days.length; i++) {
    if (opts.colorScheme === "dark" && ![1, 6, 8].includes(i)) continue
    await openDay(p, trip.id, trip.days[i].id)
    await shot(p, `${label}-day${i + 1}`)
  }

  // A past trip: the AI's weather is the fallback.
  await openDay(p, "korea-2026", "day-1", "Timeline")
  await shot(p, `${label}-korea-day1-timeline`)
  await context.close()

  // Open-Meteo unreachable: the header holds without a forecast.
  const offline = await browser.newContext({ ...opts, locale: "en-US", timezoneId: "America/Los_Angeles" })
  await offline.route("https://api.open-meteo.com/**", (route) => route.abort())
  const q = await offline.newPage()
  await q.clock.setFixedTime(NOW)
  await openDay(q, trip.id, day1, "List")
  await shot(q, `${label}-day1-no-forecast`)
  await offline.close()
}

const RUNS = {
  "desktop-light": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" },
  "desktop-dark": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" },
  "phone-light": { ...devices["iPhone 14"], colorScheme: "light" },
  "phone-dark": { ...devices["iPhone 14"], colorScheme: "dark" },
}
const only = process.env.CAPTURE_ONLY?.split(",")
// Two at a time: four software-rendered maps at once starve the screenshots.
const queue = Object.entries(RUNS).filter(([label]) => !only || only.includes(label))
await Promise.all([0, 1].map(async () => {
  for (let next = queue.shift(); next; next = queue.shift()) await run(...next)
}))
await browser.close()
if (missed.length) {
  console.error("missed:", missed.join(", "))
  process.exit(1)
}
