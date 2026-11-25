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

/** Below this long on screen, the full exit would only delay the page. */
const QUICK_BELOW_MS = 300
const QUICK_EXIT_MS = 160

/** Oldest first; the newest names the world and step on screen. */
const holds: Hold[] = []
let exit: Extract<Screen, { phase: 'leaving' }> | null = null

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

function stopExit(el: HTMLElement) {
  if (exit?.el !== el) return
  clearTimeout(exit.timer)
  exit = null
}

function reconcile() {
  const want = holds[holds.length - 1]
  const screen = current()
  if (!want) {
    if (screen.phase === 'showing') leave(screen.el)
    return
  }
  let el = screen.phase === 'gone' ? null : screen.el
  if (el && el.dataset.world !== want.world) {
    stopExit(el)
    el.remove()
    el = null
  }
  el ??= window.__bootMount?.(want.world) ?? null
  if (!el) return
  if (exit?.el === el) {
    stopExit(el)
    el.dataset.state = 'showing'
    delete el.dataset.exit
    el.removeAttribute('inert')
    el.setAttribute('aria-busy', 'true')
  }
  el.dataset.step = want.step
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
