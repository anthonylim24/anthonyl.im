/**
 * Capture the Chat + Trips surfaces for design review and PR evidence.
 *
 * Requires the local stack: Vite on :5173 and the Hono API on :3000 with
 * IG_DEV_BEARER matching VITE_DEV_BEARER (codex-dev-bearer in the cloud stubs).
 *
 *   bun frontend/scripts/capture-redesign.mjs --label before
 *   bun frontend/scripts/capture-redesign.mjs --label after --video
 *
 * Screenshots land in $SCREENSHOT_DIR (default /opt/cursor/artifacts/screenshots)
 * and videos in $VIDEO_DIR (default /opt/cursor/artifacts/videos), both prefixed
 * with the label so before/after pairs sort next to each other.
 *
 * LLM endpoints are mocked with deterministic SSE so conversations and AI panels
 * are capturable without provider keys.
 */
import { chromium, devices } from "@playwright/test"
import { mkdir, rename, readdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const API = process.env.CAPTURE_API_URL ?? "http://localhost:3000"
/** The cloud sandbox injects a production-shaped `VITE_DEV_BEARER`, which the
 *  local stack does not accept, so the fallback below is tried before giving
 *  up on the fixtures. */
const BEARER_CANDIDATES = [process.env.CAPTURE_BEARER, process.env.VITE_DEV_BEARER, "codex-dev-bearer"].filter(
  (value, index, all) => Boolean(value) && all.indexOf(value) === index,
)
let BEARER = BEARER_CANDIDATES[0]
const OUT = process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots"
const VIDEO_OUT = process.env.VIDEO_DIR ?? "/opt/cursor/artifacts/videos"

const args = process.argv.slice(2)
const label = valueOf("--label") ?? "shot"
const withVideo = args.includes("--video")
const only = valueOf("--only")

function valueOf(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

await mkdir(OUT, { recursive: true })
if (withVideo) await mkdir(VIDEO_OUT, { recursive: true })

/* ── Fixtures ─────────────────────────────────────────────────────────── */

async function api(pathname, init = {}) {
  let lastStatus = 0
  for (const candidate of BEARER_CANDIDATES) {
    const res = await fetch(`${API}${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidate}`,
        ...(init.headers ?? {}),
      },
    })
    if (res.ok) {
      BEARER = candidate
      return res.json()
    }
    lastStatus = res.status
    if (res.status !== 401) break
  }
  throw new Error(`${init.method ?? "GET"} ${pathname} -> ${lastStatus}`)
}

function isoDaysFromToday(offset) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** A trip that is under way today, so the "in progress" states are capturable.
 *  Seeded through the public API rather than a fixture file, so the shapes stay
 *  honest. Idempotent: a second run reuses the trip the first run created. */
async function ensureLiveTrip() {
  const { trips } = await api("/api/trips")
  const existing = trips.find((t) => t.name === "Lisbon Research Week")
  if (existing) return existing.slug ?? existing.id

  const { trip } = await api("/api/trips", {
    method: "POST",
    body: JSON.stringify({
      name: "Lisbon Research Week",
      destinations: ["Lisbon", "Sintra"],
      startDate: isoDaysFromToday(-2),
      endDate: isoDaysFromToday(4),
      timezone: "Europe/Lisbon",
      status: "active",
      description: "Studio visits, two client dinners, and a day out to Sintra.",
    }),
  })

  const slug = trip.slug ?? trip.id
  const plan = [
    ["Arrival and Baixa walk", "Lisbon", ["Baixa", "Chiado"]],
    ["Studio visits in Marvila", "Lisbon", ["Marvila", "Beato"]],
    ["Sintra day out", "Sintra", ["Sintra", "Colares"]],
    ["Alfama and fado", "Lisbon", ["Alfama", "Graca"]],
    ["Beach reset", "Cascais", ["Cascais", "Guincho"]],
    ["Client dinners", "Lisbon", ["Principe Real"]],
    ["Fly home", "Lisbon", ["Aeroporto"]],
  ]
  const days = plan.map(([title, city, neighborhoods], i) => ({
    id: `day-${i + 1}`,
    date: isoDaysFromToday(i - 2),
    title,
    city,
    neighborhoods,
    weather: { highC: 27 + (i % 3), lowC: 18 + (i % 2), condition: "clear" },
    items: [
      {
        id: `d${i + 1}-i1`,
        kind: "reservation",
        title: i === 0 ? "TAP 1042 to Lisbon" : `${title} booking`,
        time: "10:00",
        status: "booked",
        notes: "Confirmation in the wallet.",
        reservation: { type: i === 0 ? "flight" : "appointment", status: "confirmed" },
        createdBy: "user",
      },
      {
        id: `d${i + 1}-i2`,
        kind: "place",
        title: i === 0 ? "Manteigaria" : `${city} walk`,
        time: "16:30",
        status: "none",
        notes: "Short stop before dinner.",
        location: { name: title, source: "user", category: "landmark" },
        createdBy: "user",
      },
    ],
  }))

  await api(`/api/trips/${slug}`, {
    method: "PATCH",
    body: JSON.stringify({
      days,
      appearance: { accent: "sky", subtitle: "Seven days of studio visits and long dinners" },
    }),
  })
  return slug
}

/* ── Mocked model streams ─────────────────────────────────────────────── */

const CHAT_ANSWER = [
  "Anthony is a software engineer at DoorDash in San Francisco.\n\n",
  "He is on the **Local Commerce Service Partner** team, building the platform ",
  "that lets entrepreneurs run delivery businesses powered by DoorDash.\n\n",
  "Before that he worked on Dasher Growth and Dasher Platform, and earlier at ",
  "eBay and Tata Consultancy Services.",
]

function sseBody(chunks) {
  return (
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n"
  )
}

async function mockModelEndpoints(context, { failChat = false } = {}) {
  await context.route("**/api/invoke", async (route) => {
    if (failChat) {
      await route.fulfill({ status: 500, body: JSON.stringify({ error: "upstream unavailable" }) })
      return
    }
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: sseBody(CHAT_ANSWER),
    })
  })
}

/** Empty-state captures need a user with no trips, which the seeded store
 *  cannot give us, so the list response is emptied at the network edge. */
async function mockEmptyTripList(context) {
  await context.route("**/api/trips", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips: [] }),
    })
  })
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

async function shot(page, name) {
  const file = path.join(OUT, `${label}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log("wrote", file)
}

async function fullShot(page, name) {
  const file = path.join(OUT, `${label}-${name}-full.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log("wrote", file)
}

async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(ms)
}

/** The trips API rate-limits at 60 requests a minute and a full capture run is
 *  well over that, so a route that comes back rate-limited is retried once
 *  after the window rather than screenshotting the error state by accident. */
async function gotoRoute(page, url, name) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await settle(page, 1100)
    const limited = await page
      .getByText(/rate_limited/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (!limited) return
    console.log(`rate limited on ${name}, waiting for the window to clear`)
    await page.waitForTimeout(20_000)
  }
}

async function newContext(browser, { viewport, colorScheme, reducedMotion, video, failChat }) {
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport,
    colorScheme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    ...(video ? { recordVideo: { dir: VIDEO_OUT, size: viewport } } : {}),
  })
  await mockModelEndpoints(context, { failChat })
  return context
}

/** Report page errors loudly: a screenshot of a crashed route is worthless. */
function watchErrors(page, where) {
  page.on("pageerror", (e) => console.error(`[pageerror] ${where}: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[console] ${where}: ${m.text()}`)
  })
}

const want = (group) => !only || only === group

/* ── Capture ──────────────────────────────────────────────────────────── */

const liveTripSlug = await ensureLiveTrip().catch((e) => {
  console.warn("could not seed the live trip:", e.message)
  return null
})

const browser = await chromium.launch({ headless: true })

try {
  /* Chat -------------------------------------------------------------- */
  if (want("chat")) {
    for (const [mode, viewport] of [
      ["desktop", DESKTOP],
      ["mobile", MOBILE],
    ]) {
      for (const scheme of ["light", "dark"]) {
        const context = await newContext(browser, { viewport, colorScheme: scheme })
        const page = await context.newPage()
        watchErrors(page, `chat ${mode} ${scheme}`)
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
        await settle(page, 1200)
        await shot(page, `chat-${mode}-${scheme}-empty`)

        // First suggestion drives a full streamed answer through the mock.
        const suggestion = page.getByRole("button", { name: /DoorDash/i }).first()
        if (await suggestion.isVisible().catch(() => false)) {
          await suggestion.click()
          await page.waitForTimeout(1500)
          await shot(page, `chat-${mode}-${scheme}-conversation`)
        }
        await context.close()
      }
    }

    // Reduced motion, desktop light.
    {
      const context = await newContext(browser, {
        viewport: DESKTOP,
        colorScheme: "light",
        reducedMotion: true,
      })
      const page = await context.newPage()
      watchErrors(page, "chat reduced-motion")
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
      await settle(page, 1000)
      await shot(page, "chat-desktop-light-reduced-motion")
      await context.close()
    }

    // Error state: the model endpoint refuses, the UI must recover inline.
    {
      const context = await newContext(browser, {
        viewport: DESKTOP,
        colorScheme: "light",
        failChat: true,
      })
      const page = await context.newPage()
      watchErrors(page, "chat error")
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
      await settle(page, 1000)
      const suggestion = page.getByRole("button", { name: /DoorDash/i }).first()
      if (await suggestion.isVisible().catch(() => false)) {
        await suggestion.click()
        await page.waitForTimeout(1500)
        await shot(page, "chat-desktop-light-error")
      }
      await context.close()
    }
  }

  /* Trips -------------------------------------------------------------- */
  if (want("trips")) {
    const routes = [
      ["index", "/trips"],
      ["create", "/trips/new"],
      ["overview", "/trips/korea-2026"],
      ["day", "/trips/korea-2026/day/day-2"],
      ["editor", "/trips/korea-2026/edit"],
    ]
    if (liveTripSlug) {
      routes.push(["overview-live", `/trips/${liveTripSlug}`])
      routes.push(["day-live", `/trips/${liveTripSlug}/day/day-3`])
    }

    for (const [mode, viewport] of [
      ["desktop", DESKTOP],
      ["mobile", MOBILE],
    ]) {
      for (const scheme of ["light", "dark"]) {
        const context = await newContext(browser, { viewport, colorScheme: scheme })
        const page = await context.newPage()
        watchErrors(page, `trips ${mode} ${scheme}`)
        for (const [name, route] of routes) {
          await gotoRoute(page, `${BASE}${route}`, name)
          await shot(page, `trips-${name}-${mode}-${scheme}`)
        }
        await context.close()
      }
    }

    // Concierge panel, desktop light + mobile dark.
    for (const [mode, viewport, scheme] of [
      ["desktop", DESKTOP, "light"],
      ["mobile", MOBILE, "dark"],
    ]) {
      const context = await newContext(browser, { viewport, colorScheme: scheme })
      const page = await context.newPage()
      watchErrors(page, `concierge ${mode}`)
      await page.goto(`${BASE}/trips/korea-2026/day/day-2`, { waitUntil: "domcontentloaded" })
      await settle(page, 1000)
      const fab = page
        .getByRole("button", { name: /concierge|ask|chat/i })
        .first()
      if (await fab.isVisible().catch(() => false)) {
        await fab.click()
        await page.waitForTimeout(900)
        await shot(page, `trips-concierge-${mode}-${scheme}`)
      }
      await context.close()
    }

    // Empty state: a signed-in user with no trips yet.
    for (const [mode, viewport, scheme] of [
      ["desktop", DESKTOP, "light"],
      ["mobile", MOBILE, "light"],
    ]) {
      const context = await newContext(browser, { viewport, colorScheme: scheme })
      await mockEmptyTripList(context)
      const page = await context.newPage()
      watchErrors(page, `trips empty ${mode}`)
      await page.goto(`${BASE}/trips`, { waitUntil: "domcontentloaded" })
      await settle(page, 1100)
      await shot(page, `trips-index-empty-${mode}-${scheme}`)
      await context.close()
    }

    // Reduced motion, desktop light: the same pages with every animation off.
    {
      const context = await newContext(browser, {
        viewport: DESKTOP,
        colorScheme: "light",
        reducedMotion: true,
      })
      const page = await context.newPage()
      watchErrors(page, "trips reduced-motion")
      for (const [name, route] of [
        ["index", "/trips"],
        ["overview", "/trips/korea-2026"],
      ]) {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" })
        await settle(page, 1100)
        await shot(page, `trips-${name}-desktop-light-reduced-motion`)
      }
      await context.close()
    }
  }

  /* Out-of-scope regression sweep --------------------------------------- */
  if (want("regression")) {
    const context = await newContext(browser, { viewport: DESKTOP, colorScheme: "light" })
    const page = await context.newPage()
    watchErrors(page, "regression")
    for (const [name, route] of [
      ["korea-index", "/korea"],
      ["korea-day", "/korea/day/day-2"],
      ["breathwork-home", "/breathwork"],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" })
      await settle(page, 1200)
      await shot(page, `regression-${name}`)
    }
    await context.close()
  }

  /* Videos --------------------------------------------------------------- */
  if (withVideo) {
    // 1. Chat: ask a question, watch it stream in.
    {
      const context = await newContext(browser, {
        viewport: DESKTOP,
        colorScheme: "light",
        video: true,
      })
      const page = await context.newPage()
      watchErrors(page, "video chat")
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
      await settle(page, 1200)
      const composer = page.getByRole("textbox").first()
      await composer.click()
      await composer.type("What does Anthony build at DoorDash?", { delay: 45 })
      await page.keyboard.press("Enter")
      await page.waitForTimeout(3500)
      await context.close()
      await renameLatestVideo("chat-conversation")
    }

    // 2. Trips: index to overview to day.
    {
      const context = await newContext(browser, {
        viewport: DESKTOP,
        colorScheme: "light",
        video: true,
      })
      const page = await context.newPage()
      watchErrors(page, "video trips")
      await page.goto(`${BASE}/trips`, { waitUntil: "domcontentloaded" })
      await settle(page, 1400)
      await page.getByRole("link", { name: /South Korea/i }).first().click()
      await settle(page, 1600)
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(900)
      const firstDay = page.getByRole("link", { name: /Day 2|Apgujeong/i }).first()
      if (await firstDay.isVisible().catch(() => false)) {
        await firstDay.click()
        await settle(page, 1600)
        await page.mouse.wheel(0, 1200)
        await page.waitForTimeout(1200)
      }
      await context.close()
      await renameLatestVideo("trips-walkthrough")
    }
  }
} finally {
  await browser.close()
}

/** Playwright names videos by page GUID; give the newest one a readable name. */
async function renameLatestVideo(name) {
  const files = (await readdir(VIDEO_OUT)).filter((f) => f.endsWith(".webm"))
  const unnamed = files.filter((f) => !f.startsWith(label))
  if (unnamed.length === 0) return
  const newest = unnamed.sort().at(-1)
  const target = path.join(VIDEO_OUT, `${label}-${name}.webm`)
  await rename(path.join(VIDEO_OUT, newest), target)
  console.log("wrote", target)
}
