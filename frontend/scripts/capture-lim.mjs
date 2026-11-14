/**
 * Capture Lim's world (the chatbot at /) for PR descriptions and review:
 * the court with a hoop and a goal, the toy box, and every catalog place.
 *
 * Requires Vite on :5173 (a dev build, which exposes the scene as
 * `window.__lim`). Usage:
 *   node scripts/capture-lim.mjs <out-dir>
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const OUT = process.argv[2] ?? "screenshots/lim"
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--use-angle=metal", "--enable-features=Vulkan", "--ignore-gpu-blocklist"],
})
const errors = []

async function open(opts) {
  const context = await browser.newContext(opts)
  const p = await context.newPage()
  p.on("console", (m) => {
    if (m.type() === "error" && /THREE|WebGPU|chat/.test(m.text())) errors.push(m.text().slice(0, 240))
  })
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  await p.goto(BASE + "/")
  await p.waitForFunction(() => Boolean(window.__lim), null, { timeout: 60_000 })
  await p.evaluate(async () => {
    const spec = await import("/src/chat/world/spec.ts")
    window.__I = spec.ITEMS
    window.__P = spec.PLACES
    window.__lim.clear("all")
  })
  await p.waitForTimeout(1200)
  return p
}
const shot = async (p, name) => {
  await p.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log("  ", name)
}

const desk = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
console.log("gpu:", await desk.evaluate(async () => (navigator.gpu && (await navigator.gpu.requestAdapter()) ? "webgpu" : "webgl2")))

// The court: Lim shoots until something goes in (or 40 s pass).
await desk.evaluate(() => {
  const { __lim: L, __I: I } = window
  for (const id of ["hoop", "goal", "basketball", "soccer ball"]) L.addItem(I[id].spec)
})
await desk.waitForTimeout(3500)
await shot(desk, "court")
const before = await desk.evaluate(() => window.__lim.world().score)
for (let i = 0; i < 8; i++) {
  await desk.evaluate((ball) => window.__lim.act("shoot", ball), i % 2 ? "soccer ball" : "basketball")
  await desk.waitForTimeout(1300)
  if (i === 0) await shot(desk, "court-shot")
  await desk.waitForTimeout(3700)
  const now = await desk.evaluate(() => window.__lim.world().score)
  if (now.lim + now.you > before.lim + before.you) break
}
console.log("score:", JSON.stringify(before), "->", JSON.stringify(await desk.evaluate(() => window.__lim.world().score)))
await shot(desk, "court-score")

// The toy box, with one card hovered.
await desk.getByRole("button", { name: "Toy box" }).click()
await desk.waitForTimeout(3500)
await desk.getByRole("button", { name: "hoop", exact: true }).hover()
await desk.waitForTimeout(500)
await shot(desk, "toybox")
await desk.getByRole("button", { name: "Toy box" }).click()

for (const id of ["meadow", "beach", "snow", "space", "underwater", "volcano", "haunted", "disco"]) {
  await desk.evaluate((place) => window.__lim.setPlace(window.__P[place].spec), id)
  await desk.waitForTimeout(3200)
  await shot(desk, `place-${id}`)
}

const phone = await open({ ...devices["iPhone 14"] })
await phone.evaluate(() => {
  const { __lim: L, __I: I, __P: P } = window
  L.setPlace(P.meadow.spec)
  for (const id of ["hoop", "basketball"]) L.addItem(I[id].spec)
})
await phone.waitForTimeout(4000)
await shot(phone, "phone-court")

await browser.close()
if (errors.length) console.log("errors:\n" + [...new Set(errors)].join("\n"))
