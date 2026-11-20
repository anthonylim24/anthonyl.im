/**
 * How good Lim's stage looks, and how Auto keeps it smooth.
 *
 * The visitor picks Auto, High or Low. That resolves to a tier: the toon look (today's unlit gel,
 * also the WebGL2 and rollback path) or the lit look at one of four post rungs. The look is fixed
 * when the scene is built, so changing it rebuilds the scene; the rung changes live.
 *
 * Auto sheds in this order while frames fall behind: GI, then reflections, then ambient occlusion,
 * then (in the stage) resolution, and only when the stage is still very slow at its lowest pixel
 * ratio does it give up the lit look. It acts on a second slow window in a row (on the first when frames crawl), never in the first
 * seconds (shader compiles and model downloads stall those). Where it settles is remembered on this
 * device: a lit rung for a week, the toon look for a day.
 */

export type Graphics = 'auto' | 'high' | 'low'

/** Post rungs of the lit look, cheapest first. */
export const RUNGS = ['lit', 'ao', 'ssr', 'gi'] as const
export type Rung = (typeof RUNGS)[number]

export type Tier = { look: 'toon' } | { look: 'lit'; rung: Rung }

/** `still` is reduced motion: frames render on demand, so nothing that accumulates over frames runs. */
export type Device = { webgpu: boolean; mobile: boolean; still: boolean }

/** A window of frames the stage judged slow, and where its pixel ratio stands. */
export type Slow = { median: number; dpr: number; floor: number }

const TOON: Tier = { look: 'toon' }
const lit = (rung: Rung): Tier => ({ look: 'lit', rung })

/** Frames this slow (about 33 fps) at the lowest pixel ratio and the cheapest rung give up the lit look. */
export const GIVE_UP_MS = 30
/** Frames this slow (under about 17 fps) no screen-space pass can be worth: Auto drops them all at once. */
export const CRAWL_MS = 60
const DAY_MS = 24 * 3600 * 1000
/** Seconds of a fresh scene that never count as slow, and how close two slow windows must be to count as a row. */
export const GRACE_MS = 5000
const ROW_MS = 3000
export const GRAPHICS_KEY = 'lim-graphics'
const FIT_KEY = 'lim-graphics-fit'

export function startTier(graphics: Graphics, device: Device, fit: Tier | null): Tier {
  if (graphics === 'low') return TOON
  const want = graphics === 'high' ? lit('gi') : (fit ?? lit(device.mobile ? 'ssr' : 'gi'))
  // Screen-space passes are WebGPU only and temporal; the WebGL2 fallback and reduced motion keep the lit materials alone.
  return want.look === 'lit' && (!device.webgpu || device.still) ? lit('lit') : want
}

/** Slow windows so far in a row, and when the last one came. */
export type Strikes = { count: number; at: number }

/**
 * Whether this slow window, at `now` in a scene that started at `start`, is the one Auto acts on.
 * A window is about 90 frames, so on a very slow device the next one comes long after `ROW_MS`.
 */
export function strike(prev: Strikes, now: number, start: number, median: number): { strikes: Strikes; act: boolean } {
  if (now - start < GRACE_MS) return { strikes: { count: 0, at: now }, act: false }
  const count = now - prev.at < Math.max(ROW_MS, median * 120) ? prev.count + 1 : 1
  // A whole window's median this slow is no passing stall.
  return count >= 2 || median > CRAWL_MS ? { strikes: { count: 0, at: now }, act: true } : { strikes: { count, at: now }, act: false }
}

/** Auto's answer to a slow window: the tier to run next. The same tier means "let the stage lower its resolution". */
export function shed(tier: Tier, slow: Slow): Tier {
  if (tier.look === 'toon') return tier
  const i = RUNGS.indexOf(tier.rung)
  if (i > 0) return lit(slow.median > CRAWL_MS ? 'lit' : RUNGS[i - 1])
  if (slow.dpr > slow.floor + 0.01) return tier
  return slow.median > GIVE_UP_MS ? TOON : tier
}

/** How the visitor hears where Auto has settled. */
export function tierLabel(tier: Tier) {
  if (tier.look === 'toon') return 'Low'
  return tier.rung === 'gi' || tier.rung === 'ssr' ? 'High' : 'Medium'
}

export function readGraphics(): Graphics {
  try {
    const v = localStorage.getItem(GRAPHICS_KEY)
    return v === 'high' || v === 'low' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveGraphics(graphics: Graphics) {
  try {
    if (graphics === 'auto') localStorage.removeItem(GRAPHICS_KEY)
    else localStorage.setItem(GRAPHICS_KEY, graphics)
  } catch {
    /* private mode */
  }
}

export function parseFit(raw: string | null, now: number): Tier | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as { look?: unknown; rung?: unknown; at?: unknown }
    if (typeof o.at !== 'number' || now < o.at) return null
    if (o.look === 'toon') return now - o.at > DAY_MS ? null : TOON
    if (now - o.at > 7 * DAY_MS) return null
    return o.look === 'lit' && RUNGS.includes(o.rung as Rung) ? lit(o.rung as Rung) : null
  } catch {
    return null
  }
}

export function readFit(): Tier | null {
  try {
    return parseFit(localStorage.getItem(FIT_KEY), Date.now())
  } catch {
    return null
  }
}

export function saveFit(tier: Tier) {
  try {
    localStorage.setItem(FIT_KEY, JSON.stringify({ ...tier, at: Date.now() }))
  } catch {
    /* private mode */
  }
}

export function isMobile() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820
}
