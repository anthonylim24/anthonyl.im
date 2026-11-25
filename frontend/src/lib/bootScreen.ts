import { useLayoutEffect } from 'react'

// The boot screen (#boot) is painted by the script at the end of index.html
// before any bundle runs. This module keeps it up while something on the page
// is still on its way (the first React commit, a route's code, the sign-in
// check) and lets it play its exit once nothing is.

export type BootWorld = 'lim' | 'lab' | 'breathwork' | 'trips' | 'auth'
export type BootStep = 'start' | 'code' | 'auth'

declare global {
  interface Window {
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

/** Below this long on screen, the full exit would only delay the page. */
const QUICK_BELOW_MS = 300
/** index.html's `boot-out` animation, which the quick exit plays. */
const QUICK_EXIT_MS = 160

/** Oldest first; the newest names the world and step on screen. */
const holds: Hold[] = []
let exit: Leaving | null = null

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
    },
    quick ? QUICK_EXIT_MS : Number(el.dataset.exitMs),
  )
  exit = { phase: 'leaving', el, timer }
}

function cancelExit(screen: Leaving) {
  clearTimeout(screen.timer)
  exit = null
}

function reconcile() {
  const want = holds[holds.length - 1]
  let screen = current()
  if (!want) {
    if (screen.phase === 'showing') leave(screen.el)
    return
  }
  if (screen.phase !== 'gone' && screen.el.dataset.world !== want.world) {
    if (screen.phase === 'leaving') cancelExit(screen)
    screen.el.remove()
    screen = { phase: 'gone' }
  }
  if (screen.phase === 'gone') {
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

/** Keeps the boot screen up (bringing it back if it left) until the returned release is called. */
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

/** Mount once: React's first commit lets go of the screen the page painted. */
export function BootReady(): null {
  useLayoutEffect(releasePaint, [])
  return null
}

/** Holds the boot screen at `step` for as long as it is mounted. */
export function BootHold({ world, step }: Hold): null {
  useLayoutEffect(() => holdBoot(world, step), [world, step])
  return null
}
