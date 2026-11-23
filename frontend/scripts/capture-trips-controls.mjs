/**
 * Capture every Trips menu, dialog and form open (desktop + phone, light +
 * dark), for design review of the controls rather than the pages.
 *
 * Needs a LOCAL memory-store API (TRIPS_STORE=memory, IG_DEV_BEARER=codex-dev-bearer)
 * and Vite with the matching VITE_DEV_BEARER. Seeds its own live trip with
 * stops, a booking, costs, wishlist places, a budget, expenses, a party and a
 * checklist. Never submits an AI form. Usage:
 *   TRIPS_API=http://127.0.0.1:3000 node scripts/capture-trips-controls.mjs <out-dir>
 * `CAPTURE_ONLY=desktop-light,phone-light` limits the modes and
 * `CAPTURE_STEPS=details,share` the surfaces; `PLAYWRIGHT_BASE_URL` overrides :5173.
 * `CAPTURE_SEED_ONLY=1` seeds the trip and stops.
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const API = (process.env.TRIPS_API ?? "http://127.0.0.1:3000").replace(/\/$/, "")
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) throw new Error(`local APIs only, not ${API}`)
const OUT = process.argv[2] ?? "screenshots/trips-controls"
const NOW = new Date().toISOString()
const H = { Authorization: "Bearer codex-dev-bearer", "Content-Type": "application/json" }

const iso = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
let n = 0
const id = (p) => `${p}-${++n}`
const stop = (title, lat, lng, time, extra = {}) => ({
  id: id("stop"),
  kind: "place",
  title,
  time,
  status: "none",
  createdBy: "user",
  location: { name: title, lat, lng, category: "sight", source: "user" },
  ...extra,
})

async function api(method, url, body) {
  const res = await fetch(`${API}/api/trips${url}`, { method, headers: H, body: body && JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${url} ${res.status} ${await res.text()}`)
  return (await res.json()).trip
}

async function seed() {
  const trip = await api("POST", "", {
    name: "Lisbon and the coast, a long weekend by the sea",
    destinations: ["Lisbon", "Sintra"],
    startDate: iso(-1),
    endDate: iso(2),
    timezone: "Europe/Lisbon",
    center: { lat: 38.7223, lng: -9.1393 },
  })
  const [d1, d2, d3] = trip.days
  return api("PATCH", `/${trip.id}`, {
    budget: { currency: "EUR", total: 1200 },
    party: [
      { id: "p-ann", name: "Ann" },
      { id: "p-bo", name: "Bo" },
    ],
    expenses: [
      { id: id("x"), title: "Pastéis de Belém", amount: 12.5, currency: "EUR", category: "food", date: d1.date, paidBy: "p-ann", splitWith: ["p-ann", "p-bo"], createdAt: NOW },
      { id: id("x"), title: "Tram 28 tickets", amount: 6, currency: "EUR", category: "transport", date: d2.date, paidBy: "p-bo", splitWith: ["p-ann", "p-bo"], createdAt: NOW },
    ],
    checklist: [
      { id: id("c"), text: "Passports", done: false, group: "documents", createdAt: NOW },
      { id: id("c"), text: "Adapter (type F)", done: true, group: "packing", createdAt: NOW },
      { id: id("c"), text: "Book Pena Palace tickets", done: false, group: "todo", assignee: "p-bo", createdAt: NOW },
    ],
    ideas: [
      { id: id("idea"), kind: "place", title: "LX Factory", status: "none", createdBy: "user", location: { name: "LX Factory", lat: 38.7033, lng: -9.1789, category: "shopping", source: "user" } },
      { id: id("idea"), kind: "place", title: "Miradouro da Senhora do Monte", status: "none", createdBy: "user", location: { name: "Miradouro da Senhora do Monte", lat: 38.7192, lng: -9.1327, category: "viewpoint", source: "user" } },
      { id: id("idea"), kind: "place", title: "Time Out Market", status: "none", createdBy: "user", location: { name: "Time Out Market", lat: 38.7069, lng: -9.1459, category: "food", source: "user" } },
    ],
    days: [
      {
        ...d1,
        title: "Alfama and the castle",
        items: [
          stop("Hotel Alfama Patio", 38.7116, -9.1306, "14:00", { kind: "reservation", status: "booked", reservation: { type: "hotel", status: "confirmed", endDate: d3.date } }),
          stop("Castelo de São Jorge", 38.7139, -9.1335, "15:30", { cost: { amount: 15, currency: "EUR" } }),
          stop("Miradouro de Santa Luzia", 38.7118, -9.1301, "17:00"),
          stop("Dinner at Taberna da Rua das Flores", 38.7108, -9.1435, "20:00"),
        ],
      },
      {
        ...d2,
        title: "Belém",
        items: [
          stop("Jerónimos Monastery", 38.6979, -9.2068, "09:30", { endTime: "11:00", cost: { amount: 12, currency: "EUR" } }),
          stop("Pastéis de Belém", 38.6975, -9.2032, "11:15"),
          stop("Belém Tower", 38.6916, -9.216, "12:00"),
          stop("MAAT", 38.6957, -9.1946, "14:00"),
          stop("LX Factory", 38.7033, -9.1789, "17:30"),
        ],
      },
      { ...d3, items: [stop("Pena Palace", 38.7876, -9.3906, "10:00"), stop("Quinta da Regaleira", 38.7963, -9.3961, "14:00")] },
      ...trip.days.slice(3),
    ],
  })
}

async function settle(p, ms = 900) {
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.waitForTimeout(ms)
}

const menu = (p, name) => p.getByRole("button", { name, exact: true }).first().click()
const item = (p, name) => p.getByRole("menuitem", { name }).first().click()

/** Each step starts from a fresh load of `at`, then opens one surface. */
function steps(trip) {
  const T = `/trips/${trip.slug}`
  const day = (i) => `${T}/day/${trip.days[i].id}`
  return [
    { name: "index-search", at: "/trips", run: async (p) => p.getByPlaceholder("Search trips").fill("lis") },
    { name: "index-card-menu", at: "/trips", run: (p) => menu(p, `Options for ${trip.name}`) },
    {
      name: "index-delete",
      at: "/trips",
      run: async (p) => {
        await menu(p, `Options for ${trip.name}`)
        await item(p, "Delete trip…")
      },
    },
    {
      name: "create-city",
      at: "/trips/new",
      run: async (p) => {
        await p.getByRole("combobox").first().fill("Kyo")
        await p.getByRole("option").first().waitFor({ timeout: 8000 }).catch(() => {})
      },
    },
    {
      name: "create-dates",
      at: "/trips/new",
      run: async (p) => {
        await p.getByRole("combobox").first().fill("Kyoto")
        await p.getByRole("option").first().waitFor({ timeout: 8000 }).catch(() => {})
        await p.keyboard.press("Enter")
        await p.getByRole("button", { name: /→|Pick dates|Dates/ }).first().click()
      },
    },
    { name: "trip-menu", at: T, run: (p) => menu(p, "More trip options") },
    {
      name: "details",
      at: T,
      run: async (p) => {
        await menu(p, "More trip options")
        await item(p, "Trip details")
      },
    },
    {
      name: "details-foot",
      at: T,
      run: async (p) => {
        await menu(p, "More trip options")
        await item(p, "Trip details")
        await p.getByRole("dialog").locator("select, [role=combobox]").last().scrollIntoViewIfNeeded()
      },
    },
    {
      name: "details-zone",
      at: T,
      run: async (p) => {
        await menu(p, "More trip options")
        await item(p, "Trip details")
        const zone = p.getByRole("dialog").getByRole("combobox", { name: "Time zone" })
        await zone.scrollIntoViewIfNeeded()
        await zone.fill("to")
      },
    },
    { name: "share", at: T, run: (p) => p.getByRole("button", { name: "Share", exact: true }).first().click() },
    {
      name: "recap",
      at: T,
      run: async (p) => {
        await menu(p, "More trip options")
        await item(p, "Trip recap")
      },
    },
    { name: "palette", at: T, run: (p) => p.keyboard.press("ControlOrMeta+k") },
    { name: "shortcuts", at: T, run: (p) => p.keyboard.press("Shift+?") },
    { name: "now-menu", at: T, run: (p) => p.getByRole("button", { name: /^More for / }).first().click() },
    { name: "booking-menu", at: T, run: (p) => menu(p, "Add booking") },
    {
      name: "booking-dialog",
      at: T,
      run: async (p) => {
        await menu(p, "Add booking")
        await item(p, "Enter by hand")
      },
    },
    { name: "wishlist", at: `${T}?tab=wishlist`, run: async () => {} },
    { name: "wishlist-category", at: `${T}?tab=wishlist`, run: (p) => p.getByRole("button", { name: /^Category for / }).first().click() },
    {
      name: "wishlist-details",
      at: `${T}?tab=wishlist`,
      run: async (p) => {
        await p.getByRole("button", { name: "LX Factory", exact: true }).first().click()
        await p.waitForTimeout(1500)
      },
    },
    { name: "budget", at: `${T}?tab=budget`, run: async () => {} },
    {
      name: "budget-expense",
      at: `${T}?tab=budget`,
      run: async (p) => {
        await p.getByRole("button", { name: "Log an expense" }).click()
        await p.getByRole("button", { name: "Log expense" }).scrollIntoViewIfNeeded()
      },
    },
    { name: "checklist", at: `${T}?tab=checklist`, run: async () => {} },
    { name: "checklist-assign", at: `${T}?tab=checklist`, run: (p) => p.getByRole("button", { name: /^Assign / }).first().click() },
    { name: "essentials", at: `${T}?tab=essentials`, run: async () => {} },
    { name: "day", at: day(1), run: async () => {} },
    { name: "day-menu", at: day(1), run: (p) => menu(p, "More for day 2") },
    {
      name: "day-delete",
      at: day(1),
      run: async (p) => {
        await menu(p, "More for day 2")
        await item(p, "Delete this day")
      },
    },
    {
      name: "add-stop",
      at: day(1),
      run: async (p) => {
        const field = p.getByPlaceholder(/^Add a place, note or/).first()
        await field.scrollIntoViewIfNeeded()
        await field.fill("museu")
        await p.getByRole("listbox", { name: "Suggestions" }).waitFor({ timeout: 8000 }).catch(() => {})
      },
    },
    { name: "stop-menu", at: day(1), run: (p) => p.getByRole("button", { name: "More for MAAT" }).click() },
    {
      name: "stop-editor",
      at: day(1),
      run: async (p) => {
        await p.locator('[id^="item-"] button[aria-expanded]').first().click()
        await p.waitForTimeout(500)
      },
    },
    {
      name: "stop-editor-foot",
      at: day(1),
      run: async (p) => {
        await p.locator('[id^="item-"] button[aria-expanded]').first().click()
        await p.waitForTimeout(400)
        await p.getByLabel("Status").first().scrollIntoViewIfNeeded()
      },
    },
    {
      name: "booking-editor",
      at: day(0),
      run: async (p) => {
        await p.locator('[id^="item-"] button[aria-expanded]').first().click()
        await p.waitForTimeout(400)
        await p.locator('[id^="item-"] select, [id^="item-"] [role=combobox]').last().scrollIntoViewIfNeeded()
      },
    },
    {
      name: "day-ideas",
      at: day(1),
      run: (p) => p.getByRole("button", { name: /Ideas for this day|Plan this day with AI/ }).first().click(),
    },
  ]
}

const MODES = {
  "desktop-light": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" },
  "desktop-dark": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" },
  "phone-light": { ...devices["iPhone 14"], colorScheme: "light" },
  "phone-dark": { ...devices["iPhone 14"], colorScheme: "dark" },
}

await mkdir(OUT, { recursive: true })
const trip = await seed()
console.log("seeded", trip.slug)
// CAPTURE_SEED_ONLY=1 leaves the trip on the API for trying things by hand.
if (process.env.CAPTURE_SEED_ONLY) process.exit(0)
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const onlyModes = process.env.CAPTURE_ONLY?.split(",")
const onlySteps = process.env.CAPTURE_STEPS?.split(",")
const failed = []
for (const [mode, opts] of Object.entries(MODES)) {
  if (onlyModes && !onlyModes.includes(mode)) continue
  const context = await browser.newContext(opts)
  const p = await context.newPage()
  for (const step of steps(trip)) {
    if (onlySteps && !onlySteps.includes(step.name)) continue
    try {
      await p.goto(`${BASE}${step.at}`)
      await settle(p, 1800)
      await step.run(p)
      await settle(p, 700)
      const file = path.join(OUT, `${mode}-${step.name}.png`)
      await p.screenshot({ path: file })
      console.log("wrote", file)
    } catch (error) {
      failed.push(`${mode}-${step.name}: ${String(error.message).split("\n")[0]}`)
      console.log("FAILED", mode, step.name)
    }
  }
  await context.close()
}
await browser.close()
await api("DELETE", `/${trip.id}`).catch(() => {})
if (failed.length) {
  console.log(`\n${failed.length} step(s) could not open:\n${failed.join("\n")}`)
  process.exitCode = 1
}
