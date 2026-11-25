// The boot screen on a cold load of a built app: when the first pixels appear, when the app's own content
// is up (#root holds something other than a loading status), when the boot screen leaves, and whether its
// animation keeps drawing while the main thread is busy (frames the compositor drew inside long tasks).
//
//   node scripts/boot-perf.mjs [--base http://localhost:3230] [--routes /,/lab,/breathwork] [--throttle 4] [--net fast3g|slow4g|none] [--runs 3] [--json out.json] [--repeat]
//
// Serve a build first (`bun start` from the repo root serves frontend/dist). Each run is a fresh browser
// with an empty cache; --repeat visits the route once first, so the run measures a returning visitor
// (HTTP cache and localStorage warm). Service workers are blocked: their fetches skip the network
// throttling, which would make whichever build registered its worker sooner look faster. Works against
// a build without a boot screen too, so it measures the old page.
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : pairs), []),
)
const BASE = args.base ?? 'http://localhost:3230'
const ROUTES = (args.routes ?? '/,/lab,/breathwork,/trips,/trips/korea-2026,/sign-in').split(',')
const THROTTLE = Number(args.throttle ?? 4)
const RUNS = Number(args.runs ?? 1)
const NETS = {
  fast3g: { latency: 150, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 },
  slow4g: { latency: 80, downloadThroughput: (9e6 / 8) * 0.9, uploadThroughput: (1.5e6 / 8) * 0.9 },
  none: null,
}
const NET = NETS[args.net ?? 'slow4g']
const REPEAT = 'repeat' in args

/** Records the boot screen's life in page time (performance.now()), from before the first byte is parsed. */
function watchBoot() {
  // The loading surfaces #root shows on either build: main's text fallbacks and the Trips sign-in check.
  const WAITING = '[role="status"][aria-label^="Loading"], [role="status"][aria-label="Checking sign-in"]'
  window.__bootLog = []
  const log = (what) => window.__bootLog.push([performance.now(), what])
  let seen = null
  new MutationObserver(() => {
    const boot = document.getElementById('boot')
    if (boot && boot !== seen) {
      seen = boot
      log(`mount:${boot.dataset.world}`)
      new MutationObserver(() => log(`${boot.dataset.state}:${boot.dataset.step}${boot.dataset.exit ? ':' + boot.dataset.exit : ''}`)).observe(boot, {
        attributes: true,
        attributeFilter: ['data-state', 'data-step', 'data-exit'],
      })
    }
    if (!boot && seen) {
      seen = null
      log('removed')
    }
    const root = document.getElementById('root')
    if (!window.__appAt && root?.firstElementChild && !root.querySelector(WAITING)) {
      window.__appAt = performance.now()
      log('app')
      requestAnimationFrame(() => requestAnimationFrame(() => document.fonts.ready.then(() => {
        window.__appFontsAt = performance.now()
        log('app fonts')
      })))
    }
  }).observe(document, { childList: true, subtree: true })
}

const ms = (v) => (v == null ? null : Math.round(v))

async function measure(route) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
  if (REPEAT) {
    const first = await context.newPage()
    await first.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 })
    await first.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30_000 }).catch(() => {})
    await first.waitForTimeout(6_000)
    await first.close()
  }
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  if (NET) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NET })
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await page.addInitScript(watchBoot)
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'loading'],
  })
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 })
  await page
    .waitForFunction(() => !document.getElementById('boot') && window.__appFontsAt, null, { timeout: 30_000 })
    .catch(() => {})
  await page.waitForTimeout(500)
  const trace = JSON.parse((await browser.stopTracing()).toString())
  const timing = await page.evaluate(() => ({
    fp: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    app: window.__appAt ?? null,
    appFonts: window.__appFontsAt ?? null,
    log: window.__bootLog,
  }))
  await browser.close()

  const events = trace.traceEvents
  const nav = events.find((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame)
  const pid = nav?.pid
  const threadName = new Map(events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid).map((e) => [e.tid, e.args.name]))
  const mainTid = [...threadName].find(([, name]) => name === 'CrRendererMain')?.[0]
  const t0 = nav?.ts ?? 0
  const at = (ts) => (ts - t0) / 1000
  const long = events
    .filter((e) => e.pid === pid && e.tid === mainTid && e.name === 'RunTask' && e.ph === 'X' && e.dur > 50_000)
    .map((e) => [at(e.ts), e.dur / 1000])
  const drawn = events.filter((e) => e.pid === pid && (e.name === 'DrawFrame' || e.name === 'Graphics.Pipeline.DrawAndSwap') && e.ph !== 'e').map((e) => at(e.ts))

  const mount = timing.log.find(([, w]) => w.startsWith('mount'))?.[0] ?? null
  const leaving = timing.log.find(([, w]) => w.startsWith('leaving'))?.[0] ?? null
  const removed = timing.log.find(([, w]) => w === 'removed')?.[0] ?? null
  const showing = (s) => mount != null && s >= mount && s <= (leaving ?? Infinity)
  const blocked = long.filter(([s]) => showing(s))
  const framesInBlocked = blocked.map(([s, d]) => drawn.filter((f) => f >= s && f <= s + d).length)
  return {
    route,
    fp: ms(timing.fp),
    fcp: ms(timing.fcp),
    appReady: ms(timing.app),
    appFontsReady: ms(timing.appFonts),
    bootMount: ms(mount),
    bootLeaving: ms(leaving),
    bootRemoved: ms(removed),
    steps: timing.log.map(([t, w]) => `${ms(t)} ${w}`),
    longTasksWhileShowing: blocked.length,
    longTasks: blocked.map(([s, d], i) => `${ms(s)}+${ms(d)} (${framesInBlocked[i]} frames)`),
    blockedMs: ms(blocked.reduce((sum, [, d]) => sum + d, 0)),
    framesDrawnInsideLongTasks: framesInBlocked.reduce((a, b) => a + b, 0),
    framesPerBlockedSecond: blocked.length ? +((framesInBlocked.reduce((a, b) => a + b, 0) * 1000) / blocked.reduce((sum, [, d]) => sum + d, 0)).toFixed(1) : null,
  }
}

const results = []
for (const route of ROUTES) {
  for (let run = 0; run < RUNS; run++) {
    const r = await measure(route)
    results.push(r)
    console.log(JSON.stringify(r))
  }
}
if (args.json) await writeFile(args.json, JSON.stringify(results, null, 2))
