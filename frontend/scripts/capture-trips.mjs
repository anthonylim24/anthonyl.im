/**
 * Capture Trips screenshots (desktop + phone, light + dark) for PR
 * descriptions and design review.
 *
 * Requires the API on :3000 and Vite on :5173 with matching
 * IG_DEV_BEARER / VITE_DEV_BEARER. Usage:
 *   node scripts/capture-trips.mjs <out-dir> [tripSlug]
 * `tripSlug` is a trip with a few pinned days (defaults to korea-2026).
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const OUT = process.argv[2] ?? "screenshots/trips"
const TRIP = process.argv[3] ?? "korea-2026"
const DAY = process.argv[4] ?? "day-1"

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })

async function page(opts) {
  const context = await browser.newContext(opts)
  const p = await context.newPage()
  return p
}

async function settle(p, ms = 1500) {
  await p.waitForLoadState("networkidle").catch(() => {})
  // The map fades in once its first frame is drawn.
  await p
    .waitForFunction(() => {
      const canvas = document.querySelector(".maplibregl-canvas")
      return !canvas || getComputedStyle(canvas.closest("[role=region]").firstElementChild).opacity === "1"
    }, null, { timeout: 30_000 })
    .catch(() => {})
  await p.waitForTimeout(ms)
}

async function shot(p, name) {
  const file = path.join(OUT, `${name}.png`)
  await p.screenshot({ path: file })
  console.log("wrote", file)
}

async function run(label, opts) {
  const p = await page(opts)
  const phone = Boolean(opts.isMobile)

  await p.goto(`${BASE}/trips`)
  await settle(p, 3500)
  await shot(p, `${label}-index`)
  if (!phone) {
    await p.locator("#trips-list-title").scrollIntoViewIfNeeded()
    await p.mouse.wheel(0, 500)
    await p.waitForTimeout(900)
    await shot(p, `${label}-index-trips`)
  }

  await p.goto(`${BASE}/trips/new`)
  await settle(p, 1200)
  await p.getByRole("combobox").first().fill("Kyoto")
  await p.getByRole("option").first().waitFor({ timeout: 8000 }).catch(() => {})
  await p.keyboard.press("Enter")
  await settle(p, 4500)
  await shot(p, `${label}-create`)

  await p.goto(`${BASE}/trips/${TRIP}`)
  await settle(p, 4000)
  await shot(p, `${label}-overview`)

  await p.goto(`${BASE}/trips/${TRIP}/day/${DAY}`)
  await settle(p, 4000)
  await shot(p, `${label}-day`)

  const marker = p.getByRole("button", { name: /^Show .* on the map$/ }).nth(1)
  if (await marker.count()) {
    await marker.click()
    await settle(p, 5000)
    await shot(p, `${label}-place`)
    if (phone) await p.getByRole("tab", { name: "Itinerary" }).click()
    else await p.getByRole("button", { name: "Close place" }).click()
  }

  if (!phone) {
    await p.getByRole("button", { name: /Ideas for this day|Plan this day with AI/ }).click()
    await p.waitForTimeout(600)
    await shot(p, `${label}-ai`)
    await p.keyboard.press("Escape")
    await p.getByRole("button", { name: "Share", exact: true }).click()
    await p.waitForTimeout(900)
    await shot(p, `${label}-share`)
    await p.keyboard.press("Escape")
    await p.locator('[id^="item-"] button[aria-expanded]').first().click()
    await p.waitForTimeout(500)
    await shot(p, `${label}-edit`)
  }
  await p.context().close()
}

await run("desktop-light", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" })
await run("desktop-dark", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" })
await run("phone-light", { ...devices["iPhone 14"], colorScheme: "light" })
await run("phone-dark", { ...devices["iPhone 14"], colorScheme: "dark" })
await browser.close()
