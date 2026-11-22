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
import { createServer } from "node:http"

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

// ── A concierge with no model behind it ──────────────────────────────────
// There is no AI key locally, so the chat scenarios answer POST
// /api/trips/:id/chat from a stream served here, in the server's own event
// format (server/src/trips/chat.ts): meta, status lines, ~1,500 tokens of
// markdown in ~25 ms chunks over ~4 s, then place cards, a proposal, sources,
// `done`, follow-ups and [DONE]. `page.route` cannot stream a body, so the
// request is continued to this server, which streams it for real. Place
// photos (Wikipedia) arrive late from a route, as they do in life.

const CHAT_REPLY = (() => {
  const blocks = [
    "**Fuunji in Shinjuku** is the pick for day 2: thick *tsukemen* with a fish-and-pork broth, about a 9 minute walk from Tokyo sight 2.2, and the queue moves fast before noon.",
    "### Why it fits the day\n\n- It opens at **11:00**, right after your morning stop, so you beat the lunch line.\n- The walk on to Tokyo shop 2.3 is under 15 minutes through the station's west exit.\n- Budget about **¥1,200** a person; it is cash only, so stop at a 7-Eleven ATM first.",
    "### Two more if the line is long\n\n1. **Menya Musashi** — rich, sweet-soy ramen a few blocks east; counter seats, quick turnover, open late.\n2. **Ichiran Shinjuku Central East** — solo booths and a tick-box order sheet, good if you want something calm and predictable.",
    "> Tip: Tuesday is the quietest day at Fuunji. If you go on the weekend, aim for 10:45 and you will usually be seated within twenty minutes.",
    "I lined up a change that moves the shop to 13:30 and adds Fuunji at 11:30, so the afternoon still has an hour free before dinner. Tick what you want and apply it; you can undo it from here.",
    "Around the station there is plenty more: [Omoide Yokocho](https://en.wikipedia.org/wiki/Omoide_Yokoch%C5%8D) for yakitori in the evening, the *Shinjuku Gyoen* garden if the weather holds, and the department-store food halls (depachika) under Isetan for snacks to carry on the train.",
  ]
  let text = ""
  let i = 0
  // ~6,000 characters ≈ 1,500 tokens.
  while (text.length < 6000) text += (text ? "\n\n" : "") + blocks[i++ % blocks.length]
  return text
})()

function chatTokens(text) {
  return text.match(/\s*\S{1,4}|\s+/g) ?? [text]
}

const CHAT_PLACES = [
  { ref: "p1", name: "Fuunji", address: "2-14-3 Yoyogi, Shibuya City, Tokyo", lat: 35.6866, lng: 139.6983, category: "restaurant", dayId: "day-2", time: "11:30", rating: 4.4, ratingCount: 9821, price: "¥¥", hours: "11:00–15:00, 17:00–21:00", hoursDay: "Sun", open: true, walk: { from: "Tokyo sight 2.2", minutes: 9, meters: 720 } },
  { ref: "p2", name: "Menya Musashi", address: "7-2-6 Nishishinjuku, Shinjuku City, Tokyo", lat: 35.6953, lng: 139.6981, category: "restaurant", dayId: "day-2", rating: 4.1, ratingCount: 6120, price: "¥¥", hours: "11:00–22:30", hoursDay: "Sun", open: true, walk: { from: "Tokyo sight 2.2", minutes: 12, meters: 950 } },
  { ref: "p3", name: "Ichiran Shinjuku Central East", address: "3-34-11 Shinjuku, Shinjuku City, Tokyo", lat: 35.6911, lng: 139.7023, category: "restaurant", dayId: "day-2", rating: 4.2, ratingCount: 15433, price: "¥¥", hours: "Open 24 hours", hoursDay: "Sun", open: true, walk: { from: "Tokyo shop 2.3", minutes: 6, meters: 480 } },
]

const CHAT_PROPOSAL = {
  id: "bench-proposal",
  summary: "Lunch at Fuunji, shop moved to 13:30",
  changes: [
    { id: "c1", op: "add", dayId: "day-2", time: "11:30", place: CHAT_PLACES[0], notes: "Cash only; go before noon." },
    { id: "c2", op: "set_time", dayId: "day-2", itemId: "i-40", title: "Tokyo shop 2.3", from: "12:00", time: "13:30" },
  ],
}

async function streamChat(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
  const send = (payload) => res.write(`data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`)
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  send({ meta: { model: "bench-model", tools: ["search", "find_places", "propose_changes"] } })
  send({ status: { kind: "search", label: "Searching the web", detail: "ramen near Shinjuku" } })
  await pause(350)
  send({ status: { kind: "places", label: "Checking Google Maps", detail: "3 places" } })
  await pause(450)
  send({ status: { kind: "writing", label: "Writing it up" } })
  const tokens = chatTokens(CHAT_REPLY)
  const per = Math.ceil(tokens.length / 160)
  for (let i = 0; i < tokens.length; i += per) {
    send(JSON.stringify(tokens.slice(i, i + per).join("")))
    await pause(25)
  }
  send({ places: CHAT_PLACES })
  send({ proposal: CHAT_PROPOSAL })
  send({ sources: [{ kind: "web", title: "fuunji.com", uri: "https://fuunji.com/" }, { kind: "maps", title: "Fuunji", uri: "https://maps.google.com/?cid=1" }] })
  send({ status: { kind: "done" } })
  await pause(350)
  send({ followups: ["Is Fuunji open on Sunday?", "Somewhere for dinner nearby", "How do we get to Kyoto?"] })
  send("[DONE]")
  res.end()
}

let chatOrigin = null
async function chatServer() {
  if (chatOrigin) return chatOrigin
  const server = createServer((req, res) => {
    req.resume()
    req.on("end", () => void streamChat(res))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  server.unref()
  chatOrigin = `http://127.0.0.1:${server.address().port}`
  return chatOrigin
}

const PHOTO_SVG = (hue) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="hsl(${hue} 45% 55%)"/><circle cx="420" cy="140" r="70" fill="hsl(${hue} 50% 75%)"/></svg>`

/** Route the concierge and its photo lookups to local stand-ins. */
async function mockConcierge(page) {
  const origin = await chatServer()
  await page.route("**/api/trips/*/chat", (route) => route.continue({ url: `${origin}/chat` }))
  let n = 0
  await page.route(/wikipedia\.org\/w\/api\.php/, async (route) => {
    const k = ++n
    await new Promise((resolve) => setTimeout(resolve, 300 + (k % 3) * 250))
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ query: { pages: { [k]: { thumbnail: { source: `https://upload.wikimedia.org/bench/${k}.svg` } } } } }),
    })
  })
  await page.route(/upload\.wikimedia\.org\/bench\//, (route) => {
    const k = Number(route.request().url().match(/(\d+)\.svg/)?.[1] ?? 0)
    return route.fulfill({ contentType: "image/svg+xml", body: PHOTO_SVG((k * 67) % 360) })
  })
}

/** A conversation already under way, as a trip's concierge keeps it
 *  (`trips-concierge-v1:<route id>`): six earlier turns with cards. */
function seedConversation(page, routeId) {
  const turns = []
  for (let i = 0; i < 6; i++) {
    turns.push({ id: `seed-u${i}`, role: "user", content: `Earlier question ${i + 1} about day ${i + 1}?` })
    turns.push({
      id: `seed-a${i}`,
      role: "assistant",
      content: CHAT_REPLY.slice(0, 1400 + i * 120).replace(/\s+\S*$/, "."),
      places: CHAT_PLACES.map((p) => ({ ...p, ref: `${p.ref}-${i}` })),
      ...(i % 2 ? { proposal: { ...CHAT_PROPOSAL, id: `seed-p${i}` }, proposalState: "dismissed" } : {}),
      followups: ["Is it open on Sunday?"],
    })
  }
  return page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value)
      } catch {}
    },
    [`trips-concierge-v1:${routeId}`, JSON.stringify(turns)],
  )
}

const openConcierge = async (page) => {
  await page.getByRole("button", { name: "Open trip concierge chat" }).click()
  await page.getByRole("textbox", { name: "Message the concierge" }).waitFor({ timeout: 15_000 })
}

/** The 3D view's dialog, opened from the day map's "Fly in 3D". Only a dev
 *  build (no Google key) has it: bench it against Vite dev servers. */
const openFly = async (page) => {
  await page.getByRole("button", { name: /Fly in 3D/ }).first().click()
  await page.getByRole("dialog", { name: /in 3D/ }).waitFor({ timeout: 30_000 })
}
/** Until the loading veil has lifted. */
const flyReady = (page) => page.getByText(/^Loading .* in 3D…$/).waitFor({ state: "hidden", timeout: 40_000 })
const closeFly = async (page) => {
  await page.keyboard.press("Escape")
  await page.getByRole("dialog", { name: /in 3D/ }).waitFor({ state: "detached", timeout: 10_000 })
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
  "chat-open": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-2`)
      await ready(page)
      await page.waitForTimeout(2500)
      // Warm the panel's chunk the way a hover does, so this times the open, not the download.
      await page.getByRole("button", { name: "Open trip concierge chat" }).hover()
      await page.waitForTimeout(800)
      await rec(page, true)
      for (let i = 0; i < 2; i++) {
        await openConcierge(page)
        await page.waitForTimeout(700)
        await page.getByRole("button", { name: "Close chat" }).click()
        await page.waitForTimeout(700)
      }
    },
  },
  "chat-stream": {
    device: DESKTOP,
    async run(page, url, ids) {
      await mockConcierge(page)
      await seedConversation(page, ids.japan)
      await page.goto(`${url}/trips/${ids.japan}/day/day-2`)
      await ready(page)
      await page.waitForTimeout(2500)
      await openConcierge(page)
      await page.waitForTimeout(600)
      const field = page.getByRole("textbox", { name: "Message the concierge" })
      await field.fill("Where should we eat ramen on day 2?")
      await rec(page, true)
      await field.press("Enter")
      await page.getByRole("group", { name: "Suggested follow-ups" }).waitFor({ timeout: 20_000 })
      await page.waitForTimeout(1200)
    },
  },
  "phone-chat-stream": {
    device: PHONE,
    async run(page, url, ids) {
      await mockConcierge(page)
      await seedConversation(page, ids.japan)
      await page.goto(`${url}/trips/${ids.japan}`)
      await ready(page)
      await page.waitForTimeout(2500)
      await openConcierge(page)
      await page.waitForTimeout(600)
      const field = page.getByRole("textbox", { name: "Message the concierge" })
      await field.fill("Where should we eat ramen on day 2?")
      await rec(page, true)
      await field.press("Enter")
      await page.getByRole("group", { name: "Suggested follow-ups" }).waitFor({ timeout: 20_000 })
      await page.waitForTimeout(1200)
    },
  },
  // The 3D view exists only in a dev build (no Google key: the procedural
  // ground), so these two run against Vite dev servers. One open happens
  // before recording so module loading is out of the numbers.
  "fly-open": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-2`)
      await ready(page)
      await page.waitForTimeout(2500)
      await openFly(page)
      await flyReady(page)
      await closeFly(page)
      await page.waitForTimeout(800)
      await rec(page, true)
      await openFly(page)
      await flyReady(page)
      await page.waitForTimeout(3000)
      await closeFly(page)
      await page.waitForTimeout(800)
    },
  },
  "fly-tour": {
    device: DESKTOP,
    async run(page, url, ids) {
      await page.goto(`${url}/trips/${ids.japan}/day/day-2`)
      await ready(page)
      await page.waitForTimeout(2500)
      await openFly(page)
      await flyReady(page)
      await page.waitForTimeout(3500)
      await rec(page, true)
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight")
        await page.waitForTimeout(1600)
      }
      await page.keyboard.press("f")
      await page.waitForTimeout(2000)
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
  // The index on a phone: the globe, the next-trip link and the list settle
  // in one column, so anything that arrives late pushes the rest down (cls).
  "phone-index-load": {
    device: PHONE,
    fromStart: true,
    async run(page, url) {
      await page.goto(`${url}/trips`)
      await page.getByText("Lisbon long weekend").first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(3000)
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
