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
