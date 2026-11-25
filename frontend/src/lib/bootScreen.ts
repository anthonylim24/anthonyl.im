import { useLayoutEffect } from 'react'

export type BootWorld = 'lim' | 'lab' | 'breathwork' | 'trips' | 'auth'
export type BootStep = 'start' | 'code' | 'auth'

declare global {
  interface Window {
    // Defined by the boot script at the end of index.html, which paints #boot before any bundle runs.
    __bootMount?: (world: BootWorld) => HTMLElement | null
  }
}

interface Hold {
  world: BootWorld
  step: BootStep
}

type Screen =
  | { phase: 'gone' }
  | { phase: 'showing'; el: HTMLElement }
  | { phase: 'leaving'; el: HTMLElement; timer: ReturnType<typeof setTimeout> }

type Leaving = Extract<Screen, { phase: 'leaving' }>

const QUICK_BELOW_MS = 300
const QUICK_EXIT_MS = 160
/** Once the page has shown, a wait shorter than this is not worth covering the page for. */
const LATE_AFTER_MS = 200

/** By this long after the screen goes, the app has drawn its first screen and fetched that screen's fonts. */
const FONTS_SETTLE_MS = 4_000
const FONTS_KEY = 'boot-fonts'

const holds: Hold[] = []
let exit: Leaving | null = null
let late: ReturnType<typeof setTimeout> | null = null

function current(): Screen {
  const el = document.getElementById('boot')
  if (!el) return { phase: 'gone' }
  return exit?.el === el ? exit : { phase: 'showing', el }
}

function leave(el: HTMLElement) {
  const quick =
    performance.now() - Number(el.dataset.shownAt) < QUICK_BELOW_MS ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.dataset.state = 'leaving'
  if (quick) el.dataset.exit = 'quick'
  el.toggleAttribute('inert', true)
  el.removeAttribute('aria-busy')
  const timer = setTimeout(
    () => {
      el.remove()
      if (exit?.el === el) exit = null
      setTimeout(() => void document.fonts.ready.then(rememberLoadedFonts), FONTS_SETTLE_MS)
    },
    quick ? QUICK_EXIT_MS : Number(el.dataset.exitMs),
  )
  exit = { phase: 'leaving', el, timer }
}

function hasLoaded(face: string): boolean {
  const [family, style = 'normal'] = face.split(':')
  for (const font of document.fonts) {
    if (font.family.replace(/["']/g, '') === family && font.style === style && font.status === 'loaded') return true
  }
  return false
}

/**
 * Records each world whose web fonts this page has loaded, so the boot script
 * draws that world's next screen in them: they come from the HTTP cache then,
 * not over a network the app's code needs.
 */
export function rememberLoadedFonts(): void {
  try {
    const known: unknown = JSON.parse(localStorage.getItem(FONTS_KEY) ?? '[]')
    const worlds = new Set(Array.isArray(known) ? known.filter((w): w is string => typeof w === 'string') : [])
    const before = worlds.size
    for (const template of document.querySelectorAll<HTMLTemplateElement>('template[id^="boot-"][data-fonts]')) {
      if (template.dataset.fonts!.split('|').every(hasLoaded)) worlds.add(template.id.slice('boot-'.length))
    }
    if (worlds.size !== before) localStorage.setItem(FONTS_KEY, JSON.stringify([...worlds]))
  } catch {
    // Unreadable storage: every screen keeps drawing in system faces.
  }
}

function cancelExit(screen: Leaving) {
  clearTimeout(screen.timer)
  exit = null
}

function mountLate() {
  late = null
  const want = holds[holds.length - 1]
  if (!want || current().phase !== 'gone') return
  const el = window.__bootMount?.(want.world)
  if (!el) return
  el.dataset.late = ''
  el.dataset.step = want.step
}

function reconcile() {
  const want = holds[holds.length - 1]
  let screen = current()
  if (!want) {
    if (late) clearTimeout(late)
    late = null
    if (screen.phase === 'showing') leave(screen.el)
    return
  }
  if (screen.phase === 'gone') {
    late ??= setTimeout(mountLate, LATE_AFTER_MS)
    return
  }
  if (screen.el.dataset.world !== want.world) {
    if (screen.phase === 'leaving') cancelExit(screen)
    screen.el.remove()
    const el = window.__bootMount?.(want.world)
    if (!el) return
    screen = { phase: 'showing', el }
  }
  if (screen.phase === 'leaving') {
    cancelExit(screen)
    const { el } = screen
    el.dataset.state = 'showing'
    delete el.dataset.exit
    el.removeAttribute('inert')
    el.setAttribute('aria-busy', 'true')
  }
  screen.el.dataset.step = want.step
}

export function holdBoot(world: BootWorld, step: BootStep): () => void {
  const hold: Hold = { world, step }
  holds.push(hold)
  reconcile()
  return () => {
    const at = holds.indexOf(hold)
    if (at === -1) return
    holds.splice(at, 1)
    // A fallback unmounting and the next wait mounting happen in one commit;
    // judging after it means the screen never starts an exit between them.
    queueMicrotask(reconcile)
  }
}

const painted = document.getElementById('boot')
const releasePaint = painted ? holdBoot(painted.dataset.world as BootWorld, 'start') : () => {}

export function BootReady(): null {
  useLayoutEffect(releasePaint, [])
  return null
}

export function BootHold({ world, step }: Hold): null {
  useLayoutEffect(() => holdBoot(world, step), [world, step])
  return null
}
