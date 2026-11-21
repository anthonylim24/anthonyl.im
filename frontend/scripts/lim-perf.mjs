// Lim's stage under a stopwatch: how long until the scene draws, and how smooth its frames are while it
// boots, while new toys arrive, while things happen, and at rest. Needs the Vite dev server (it drives
// the scene through the dev-only `window.__lim`).
//
//   node scripts/lim-perf.mjs [--graphics high|low|auto] [--throttle 4] [--runs 3] [--toys rocket,duck] [--json out.json] [--profile spawn.cpuprofile]
//
// Every run is a first visit: a fresh browser with no shader cache, since a warm cache hides compile stalls.
// LIM_PERF_URL overrides http://localhost:5173/.
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
)
const URL = process.env.LIM_PERF_URL ?? 'http://localhost:5173/'
const graphics = args.graphics ?? 'high'
const throttle = Number(args.throttle ?? 1)
const runs = Number(args.runs ?? 1)
const SPAWN = args.toys ? args.toys.split(',') : ['rocket', 'robot', 'disco ball', 'kite', 'umbrella', 'lantern', 'watermelon', 'ice cream', 'music box', 'mushroom', 'teddy', 'duck']

/** The scene's own CPU time per frame, split into simulate, skin and render (ms): mean and worst. */
function cpu(split, from, to) {
  const t = split.filter(([at]) => at >= from && at <= to)
  const part = (k) => {
    const v = t.map((s) => s[k]).sort((a, b) => a - b)
    return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}/${v.at(-1).toFixed(0)}` : '-'
  }
  return { sim: part(1), skin: part(2), render: part(3) }
}

function stats(frames, long, from, to) {
  const t = frames.filter((x) => x >= from && x <= to)
  const gaps = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  const at = (q) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] : 0)
  const blocked = long.filter(([s]) => s >= from && s <= to)
  return {
    frames: t.length,
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    p99: +at(0.99).toFixed(1),
    max: +(gaps.at(-1) ?? 0).toFixed(1),
    over33: gaps.filter((g) => g > 33.4).length,
    over50: gaps.filter((g) => g > 50).length,
    longTasks: blocked.length,
    blockedMs: Math.round(blocked.reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0)),
  }
}

async function run() {
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-shader-disk-cache'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript((g) => {
    localStorage.removeItem('lim-graphics-fit')
    localStorage.removeItem('lim-world')
    localStorage.setItem('lim-graphics', g)
    const perf = (window.__perf = { frames: [], long: [], gpu: [], calls: [], split: [], marks: {}, stage: {} })
    // With the queue idle at submit (vsync), the wait for it after a frame's render is that frame's GPU work.
    const request = GPUAdapter.prototype.requestDevice
    GPUAdapter.prototype.requestDevice = async function (...a) {
      const device = await request.apply(this, a)
      window.__limFrame = (info, split) => {
        if (info) perf.calls.push(info.drawCalls)
        if (split) perf.split.push([performance.now(), ...split])
        const t0 = performance.now()
        void device.queue.onSubmittedWorkDone().then(() => perf.gpu.push([t0, performance.now() - t0]))
      }
      return device
    }
    const loop = (now) => {
      perf.frames.push(now)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.long.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
    new MutationObserver(() => {
      const kind = document.querySelector('[data-stage]')?.getAttribute('data-stage')
      if (kind && !(kind in perf.stage)) perf.stage[kind] = performance.now()
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-stage'], childList: true })
  }, graphics)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  const cdp = await ctx.newCDPSession(page)
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await page.goto(URL)
  await page.waitForFunction(() => window.__perf.stage.live && window.__lim, null, { timeout: 120_000 })
  const mark = (name) => page.evaluate((n) => (window.__perf.marks[n] = performance.now()), name)
  await mark('boot')
  await page.waitForTimeout(4000)
  await mark('spawn')
  if (args.profile) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  await page.evaluate(async (ids) => {
    const { ITEMS } = await import('/src/chat/world/spec.ts')
    window.__lim.clear('items')
    for (const id of ids) {
      if (!ITEMS[id]) console.error(`lim-perf: no toy "${id}"`)
      else window.__lim.addItem(ITEMS[id].spec)
      await new Promise((done) => setTimeout(done, 700))
    }
  }, SPAWN)
  await page.waitForTimeout(3000)
  await mark('events')
  if (args.profile) await writeFile(args.profile, JSON.stringify((await cdp.send('Profiler.stop')).profile))
  await page.evaluate(async () => {
    const beat = () => new Promise((done) => setTimeout(done, 800))
    window.__lim.cheer(true)
    await beat()
    window.__lim.stunt('flip')
    await beat()
    window.__lim.tweak({ weather: 'snow' })
    await beat()
    window.__lim.act('kick', '')
    await beat()
    window.__lim.setNight(true)
    await beat()
    window.__lim.tweak({ weather: 'none' })
    await beat()
  })
  await mark('idle')
  await page.waitForTimeout(4000)
  await mark('end')
  const data = await page.evaluate(() => window.__perf)
  await browser.close()
  const m = data.marks
  const gpu = data.gpu.filter(([at]) => at >= m.idle).map(([, ms]) => ms).sort((a, b) => a - b)
  return {
    firstFrameMs: Math.round(data.stage.live),
    sceneMs: Math.round(data.stage.live - (data.stage.loading ?? data.stage.live)),
    boot: { ...stats(data.frames, data.long, m.boot, m.spawn), ...cpu(data.split, m.boot, m.spawn) },
    spawn: { ...stats(data.frames, data.long, m.spawn, m.events), ...cpu(data.split, m.spawn, m.events) },
    events: { ...stats(data.frames, data.long, m.events, m.idle), ...cpu(data.split, m.events, m.idle) },
    idle: { ...stats(data.frames, data.long, m.idle, m.end), ...cpu(data.split, m.idle, m.end) },
    idleDrawCalls: data.calls.at(-1) ?? null,
    idleGpuMs: gpu.length ? { p50: +gpu[gpu.length >> 1].toFixed(2), p95: +gpu[Math.floor(gpu.length * 0.95)].toFixed(2) } : null,
    errors,
  }
}

const results = []
for (let i = 0; i < runs; i++) results.push(await run())

console.log(`graphics ${graphics}, CPU throttle ${throttle}x, ${runs} run(s)`)
for (const [i, r] of results.entries()) {
  const gpu = r.idleGpuMs ? `, idle GPU ${r.idleGpuMs.p50} ms (p95 ${r.idleGpuMs.p95}), ${r.idleDrawCalls} draws` : ''
  console.log(`run ${i + 1}: first frame ${r.firstFrameMs} ms (scene ${r.sceneMs} ms)${gpu}${r.errors.length ? `, ${r.errors.length} console errors` : ''}`)
  console.table(Object.fromEntries(['boot', 'spawn', 'events', 'idle'].map((k) => [k, r[k]])))
  for (const e of r.errors.slice(0, 5)) console.log('  error:', e)
}
if (args.json) await writeFile(args.json, JSON.stringify({ graphics, throttle, results }, null, 2))
