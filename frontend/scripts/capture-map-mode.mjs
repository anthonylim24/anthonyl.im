/**
 * Capture Map Mode screenshots for PR descriptions.
 * Requires Vite on :5173 and the API on :3000 with IG_DEV_BEARER matching
 * VITE_DEV_BEARER (codex-dev-bearer in cloud stubs).
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const OUT = process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots"
const SEOUL = { latitude: 37.5081, longitude: 127.0606, accuracy: 25 }
const ABROAD = { latitude: 37.7749, longitude: -122.4194, accuracy: 25 }

await mkdir(OUT, { recursive: true })

async function shot(page, name) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, fullPage: false })
  console.log("wrote", file)
  return file
}

async function openMapMode(page, { geolocation, colorScheme = "light" }) {
  const context = page.context()
  await context.grantPermissions(["geolocation"])
  await context.setGeolocation(geolocation)
  await page.emulateMedia({ colorScheme })

  await page.goto(`${BASE}/trips/korea-2026/day/day-3`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /Enter Map Mode/i }).click()

  // Wait until Map Mode dialog is up and loading has finished (mapReady).
  const dialog = page.getByRole("dialog", { name: /Map Mode/i })
  await dialog.waitFor({ state: "visible", timeout: 30_000 })
  await page.getByText(/Loading places/i).waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {})
  // Location pill or filter bar signals readiness.
  await Promise.race([
    page.getByRole("navigation", { name: /Filter places/i }).waitFor({ timeout: 45_000 }),
    page.getByText(/Day center|Live/i).first().waitFor({ timeout: 45_000 }),
    page.getByText(/Map unavailable/i).waitFor({ timeout: 45_000 }),
  ])
  // Let entrance motion settle.
  await page.waitForTimeout(900)
  return dialog
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
})

try {
  // Desktop — abroad → Day center
  {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
      geolocation: ABROAD,
      permissions: ["geolocation"],
      colorScheme: "light",
    })
    const page = await context.newPage()
    await openMapMode(page, { geolocation: ABROAD })
    await shot(page, "map-mode-desktop-day-center.png")

    // Toggle list if 3D is available; otherwise already list.
    const listBtn = page.getByRole("button", { name: /List view|List/i }).first()
    if (await listBtn.isVisible().catch(() => false)) {
      await listBtn.click()
      await page.waitForTimeout(500)
      await shot(page, "map-mode-desktop-list.png")
      const mapBtn = page.getByRole("button", { name: /3D map view|Map/i }).first()
      if (await mapBtn.isVisible().catch(() => false)) await mapBtn.click()
      await page.waitForTimeout(400)
    }

    // Filters visible
    const scheduled = page.getByRole("button", { name: /Scheduled/i }).first()
    if (await scheduled.isVisible().catch(() => false)) {
      await shot(page, "map-mode-desktop-filters.png")
    }

    await context.close()
  }

  // Desktop — in Seoul → Live
  {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
      geolocation: SEOUL,
      permissions: ["geolocation"],
      colorScheme: "light",
    })
    const page = await context.newPage()
    await openMapMode(page, { geolocation: SEOUL })
    await shot(page, "map-mode-desktop-live.png")
    await context.close()
  }

  // Mobile — abroad
  {
    const context = await browser.newContext({
      ...devices["iPhone 14"],
      geolocation: ABROAD,
      permissions: ["geolocation"],
      colorScheme: "light",
    })
    const page = await context.newPage()
    await openMapMode(page, { geolocation: ABROAD })
    await shot(page, "map-mode-mobile-day-center.png")
    await context.close()
  }

  // Dark mode desktop
  {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
      geolocation: ABROAD,
      permissions: ["geolocation"],
      colorScheme: "dark",
    })
    const page = await context.newPage()
    // Prefer the app's own dark class if present on the trips shell.
    await openMapMode(page, { geolocation: ABROAD, colorScheme: "dark" })
    await page.evaluate(() => {
      document.documentElement.classList.add("dark")
      document.body.classList.add("dark")
    })
    await page.waitForTimeout(400)
    await shot(page, "map-mode-desktop-dark.png")
    await context.close()
  }
} finally {
  await browser.close()
}

console.log("done")
