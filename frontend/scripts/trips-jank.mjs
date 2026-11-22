// Trips under a stopwatch: frame pacing, long animation frames, layout shift
// and input latency across the interactions people repeat all day. Compares
// builds: each --target is a production build served by its own local
// memory-store API (seeded with scripts/seed-bench-trips.ts).
//
//   node scripts/trips-jank.mjs --target base=http://127.0.0.1:3100 --target head=http://127.0.0.1:3101 \
//     [--runs 5] [--throttle 4] [--look atlas|glass] [--theme light|dark] [--only a,b] [--json out.json]
//
// Method: one sample = one scenario in a fresh browser context (cold page
// load, then the scripted interaction), on headless Chromium with the real GPU
// (ANGLE Metal; SwiftShader numbers mean nothing for backdrop filters and
// shaders) and CPU throttled 4x. Runs alternate targets (A B A B …) so drift
// hits both. Reported per scenario: the median over runs of
//   p95   95th-percentile frame interval (ms) while recording
//   jank  frames over 25 ms (a frame missed at 60 Hz)
//   drop  frames lost (interval / 16.7 − 1, summed)
//   loaf  long-animation-frame blocking time (ms)
//   cls   layout shift (no recent input)
//   inp   the slowest input event (ms), an INP stand-in
import { createRequire } from "node:module"
import { writeFile } from "node:fs/promises"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : fallback
}
const targets = argv.flatMap((a, i) => (a === "--target" ? [argv[i + 1]] : [])).map((pair) => {
  const [label, url] = pair.split("=")
  return { label, url: url.replace(/\/$/, "") }
})
if (targets.length === 0) throw new Error("pass at least one --target label=url")
const runs = Number(flag("runs", 5))
const throttle = Number(flag("throttle", 4))
const look = flag("look", "atlas")
const theme = flag("theme", "light")
const only = flag("only", "")?.split(",").filter(Boolean) ?? []
const json = flag("json", null)

const DESKTOP = { viewport: { width: 1280, height: 860 } }
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

/** Ids of the seeded trips on a target, by name. */
async function seeded(url) {
  const res = await fetch(`${url}/api/trips`, { headers: { Authorization: "Bearer codex-dev-bearer" } })
  if (!res.ok) throw new Error(`${url}: list ${res.status}`)
  const { trips } = await res.json()
  const find = (name) => {
    const trip = trips.find((t) => t.name === name)
    if (!trip) throw new Error(`${url}: no "${name}" (run scripts/seed-bench-trips.ts)`)
    return trip.slug ?? trip.id
  }
  return { lisbon: find("Lisbon long weekend"), japan: find("Japan in autumn") }
}

const RECORDER = ({ look, theme, fromStart }) => {
  try {
    localStorage.setItem("trips-look", look)
    localStorage.setItem("korea-theme", theme)
  } catch {}
  const j = (window.__jank = { rec: fromStart, frames: [], loaf: [], cls: 0, events: [] })
  const tick = (t) => {
    if (j.rec) j.frames.push(t)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const observe = (type, fn, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => j.rec && fn(e))).observe({ type, buffered: fromStart, ...extra })
    } catch {}
  }
  observe("long-animation-frame", (e) => j.loaf.push(e.blockingDuration ?? 0))
  observe("layout-shift", (e) => !e.hadRecentInput && (j.cls += e.value))
  observe("event", (e) => j.events.push(e.duration), { durationThreshold: 16 })
}

const rec = (page, on) => page.evaluate((on) => (window.__jank.rec = on), on)
const ready = (page) => page.getByRole("button", { name: "More trip options" }).first().waitFor({ timeout: 30_000 })
const wheel = async (page, x, y, steps, dy) => {
  await page.mouse.move(x, y)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(16)
  }
}

const SCENARIOS = {
  "index-load": {
    device: DESKTOP,
    fromStart: true,
    async run(page, url) {
      await page.goto(`${url}/trips`)
      await page.getByText("Lisbon long weekend").first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(2500)
    },
  },
  "trip-load": {
    device: DESKTOP,
    fromStart: true,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(3000)
    },
  },
  "overview-scroll": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await wheel(page, 320, 560, 30, 120)
      await wheel(page, 320, 560, 30, -120)
      await page.waitForTimeout(400)
    },
  },
  "day-switch": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-1`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("ArrowRight")
        await page.waitForTimeout(700)
      }
    },
  },
  "tab-switch": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      const tabs = page.getByRole("tablist", { name: "Trip overview" }).getByRole("tab")
      const count = await tabs.count()
      await rec(page, true)
      for (let i = 1; i <= count; i++) {
        await tabs.nth(i % count).click()
        await page.waitForTimeout(600)
      }
    },
  },
  "menu-palette": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "More trip options" }).first().click()
      await page.waitForTimeout(500)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(300)
      await page.keyboard.press("ControlOrMeta+k")
      await page.waitForTimeout(400)
      await page.keyboard.type("bud", { delay: 80 })
      await page.waitForTimeout(400)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    },
  },
  "map-drag": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-2`)
      await ready(page)
      await page.waitForTimeout(3000)
      const box = await page.locator("canvas.maplibregl-canvas").first().boundingBox()
      if (!box) throw new Error("no map canvas")
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await rec(page, true)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 0; i < 40; i++) {
        await page.mouse.move(cx - i * 6, cy - i * 3)
        await page.waitForTimeout(16)
      }
      await page.mouse.up()
      await wheel(page, cx, cy, 6, -240)
      await page.waitForTimeout(1200)
    },
  },
  typing: {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-1`)
      await ready(page)
      await page.waitForTimeout(2500)
      const field = page.getByPlaceholder(/Add a place, note/).first()
      await field.click()
      await rec(page, true)
      await page.keyboard.type("Ramen near the station", { delay: 40 })
      await page.waitForTimeout(600)
      await rec(page, false)
      await page.keyboard.press("Escape")
    },
  },
  "phone-load": {
    device: PHONE,
    fromStart: true,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.lisbon}`)
      await ready(page)
      await page.waitForTimeout(3000)
    },
  },
  "phone-view-switch": {
    device: PHONE,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.lisbon}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("radio", { name: "Map" }).click()
      await page.waitForTimeout(1500)
      await page.getByRole("radio", { name: "Itinerary" }).click()
      await page.waitForTimeout(1200)
    },
  },
  "phone-scroll": {
    device: PHONE,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await wheel(page, 195, 500, 30, 160)
      await wheel(page, 195, 500, 30, -160)
      await page.waitForTimeout(400)
    },
  },
  // Overlays and the create flow. Each only opens and closes: nothing here
  // saves, so it is safe to point at a shared base.
  "details-dialog": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "More trip options" }).first().click()
      await page.waitForTimeout(300)
      await page.getByRole("menuitem", { name: "Trip details" }).click()
      await page.waitForTimeout(700)
      await page.getByRole("button", { name: /^Dates:/ }).click()
      await page.waitForTimeout(500)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(300)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(600)
    },
  },
  "share-dialog": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "Share", exact: true }).first().click()
      await page.waitForTimeout(900)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(600)
    },
  },
  "instagram-sheet": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "More trip options" }).first().click()
      await page.waitForTimeout(300)
      await page.getByRole("menuitem", { name: "Add places from Instagram" }).click()
      await page.waitForTimeout(1500)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(800)
    },
  },
  "create-flow": {
    device: DESKTOP,
    async run(page, url) {
      await page.goto(`${url}/trips/new`)
      await page.getByRole("button", { name: /^Dates:/ }).waitFor({ timeout: 30_000 })
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "1 week" }).click()
      await page.waitForTimeout(300)
      await page.getByRole("button", { name: /^Dates:/ }).click()
      await page.waitForTimeout(500)
      await page.keyboard.press("ArrowRight")
      await page.keyboard.press("Enter")
      await page.waitForTimeout(150)
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
      await page.waitForTimeout(400)
      await page.getByRole("switch", { name: /Draft the itinerary with AI/ }).click()
      await page.waitForTimeout(600)
      await page.getByRole("switch", { name: /Draft the itinerary with AI/ }).click()
      await page.waitForTimeout(400)
    },
  },
  "index-return": {
    device: DESKTOP,
    async run(page, url) {
      await page.goto(`${url}/trips`)
      await page.getByText("Lisbon long weekend").first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(4000)
      await page.getByRole("link", { name: /^Lisbon long weekend,/ }).click()
      await ready(page)
      await page.waitForTimeout(2000)
      await rec(page, true)
      await page.goBack()
      await page.getByText("Lisbon long weekend").first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(2500)
    },
  },
  "phone-details": {
    device: PHONE,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.lisbon}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await rec(page, true)
      await page.getByRole("button", { name: "More trip options" }).first().click()
      await page.waitForTimeout(300)
      await page.getByRole("menuitem", { name: "Trip details" }).click()
      await page.waitForTimeout(800)
      await page.getByRole("button", { name: /^Dates:/ }).click()
      await page.waitForTimeout(500)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(300)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(700)
    },
  },
}

function measure(j) {
  const gaps = j.frames.slice(1).map((t, i) => t - j.frames[i])
  const sorted = [...gaps].sort((a, b) => a - b)
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0
  return {
    frames: gaps.length,
    p95: +p95.toFixed(1),
    jank: gaps.filter((g) => g > 25).length,
    drop: Math.round(gaps.reduce((sum, g) => sum + Math.max(0, Math.round(g / 16.7) - 1), 0)),
    loaf: Math.round(j.loaf.reduce((a, b) => a + b, 0)),
    cls: +j.cls.toFixed(4),
    inp: Math.round(Math.max(0, ...j.events)),
  }
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] })
const ids = Object.fromEntries(await Promise.all(targets.map(async (t) => [t.label, await seeded(t.url)])))
const names = Object.keys(SCENARIOS).filter((name) => only.length === 0 || only.includes(name))
const samples = {}

for (const name of names) {
  const scenario = SCENARIOS[name]
  for (let r = 0; r < runs; r++) {
    for (const target of r % 2 ? [...targets].reverse() : targets) {
      const context = await browser.newContext({ ...scenario.device, colorScheme: theme, reducedMotion: "no-preference" })
      const page = await context.newPage()
      await page.addInitScript(RECORDER, { look, theme, fromStart: Boolean(scenario.fromStart) })
      const cdp = await context.newCDPSession(page)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
      try {
        await scenario.run(page, target.url, ids[target.label])
        const j = await page.evaluate(() => window.__jank)
        ;((samples[name] ??= {})[target.label] ??= []).push(measure(j))
      } catch (error) {
        console.error(`${name} ${target.label} run ${r + 1}: ${error.message.split("\n")[0]}`)
      }
      await context.close()
    }
  }
  const row = Object.entries(samples[name] ?? {}).map(([label, list]) => {
    const m = Object.fromEntries(Object.keys(list[0]).map((k) => [k, median(list.map((s) => s[k]))]))
    return `${label}: p95 ${m.p95} · jank ${m.jank} · drop ${m.drop} · loaf ${m.loaf} · cls ${m.cls} · inp ${m.inp} (n=${list.length})`
  })
  console.log(`${name.padEnd(18)} ${row.join("   |   ")}`)
}

await browser.close()
if (json) await writeFile(json, JSON.stringify({ runs, throttle, look, theme, targets, samples }, null, 2))
