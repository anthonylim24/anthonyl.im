import { useEffect, useRef, useState, type Ref } from 'react'
import { MessageCircle } from 'lucide-react'
import { sx } from '@/styles/merge'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { loader as l, pill as p } from '@/styles/limLoader.stylex'
import { LimArt } from './LimArt'
import { sound } from './sound'
import type { LoaderState, LoadStep } from './loader'

/** What the stage is really doing, in Lim's words. */
const STEPS: Record<LoadStep, string> = {
  code: 'Downloading the wobble',
  gpu: 'Waking up your graphics card',
  toys: 'Unpacking the toy box',
  light: 'Switching on the studio lights',
  warm: 'Letting the jelly set',
}
const POKES = ['boing!', 'hehe!', 'squish!', 'not set yet!', 'wobble!', 'that tickles!', 'okay, okay, hurrying!']
/** Placed from the right: only the leading end of the jelly is in the bar. */
const BUBBLES = [
  { right: '5%', delay: '0s' },
  { right: '19%', delay: '-0.8s' },
  { right: '33%', delay: '-1.4s' },
  { right: '55%', delay: '-0.4s' },
  { right: '74%', delay: '-1.1s' },
]
/** How long each exit plays; these match the sheet's `leaving` animations. */
const EXIT_MS = { full: 740, quick: 200, still: 260 }
const LIP = 'M0 40V22Q60 4 120 22T240 22T360 22T480 22T600 22T720 22T840 22T960 22T1080 22T1200 22V40Z'

const percent = (done: number) => Math.round(done * 100)
/** The jelly (and Lim riding it) moves by transform alone, so it keeps moving while the page is busy. */
const fillAt = (done: number) => ({ transform: `translateX(${((done - 1) * 100).toFixed(2)}%)` })

/**
 * The first thing on Lim's page while the live stage loads: Lim bouncing along a jelly bar that
 * fills with the real progress. "Chat first" (or Escape) shows the chat at once; when the stage is
 * ready Lim leaps off and the sheet slides away.
 */
export function LimLoader({
  state,
  onSkip,
  onExited,
  ref,
}: {
  state: Extract<LoaderState, { phase: 'loading' | 'leaving' }>
  onSkip: () => void
  onExited: () => void
  ref?: Ref<HTMLDivElement>
}) {
  const reducedMotion = useReducedMotion()
  const [pokes, setPokes] = useState(0)
  const [giggling, setGiggling] = useState(false)
  const giggleTimer = useRef(0)
  const leaving = state.phase === 'leaving'
  const done = leaving ? 1 : state.done
  const line = leaving ? "Lim's ready" : STEPS[state.step]
  const exitMs = !leaving ? 0 : reducedMotion ? EXIT_MS.still : state.quick ? EXIT_MS.quick : EXIT_MS.full

  useEffect(() => {
    if (!exitMs) return
    const timer = window.setTimeout(onExited, exitMs)
    return () => window.clearTimeout(timer)
  }, [exitMs, onExited])
  useEffect(() => () => window.clearTimeout(giggleTimer.current), [])

  const poke = () => {
    setPokes((n) => n + 1)
    setGiggling(true)
    sound.boing(0.45)
    window.clearTimeout(giggleTimer.current)
    giggleTimer.current = window.setTimeout(() => setGiggling(false), 900)
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lim-loader-title"
      // On its way out it lets go of focus and taps, so the page is usable while it slides away.
      inert={leaving}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onSkip()
      }}
      {...sx(l.sheet, leaving && (state.quick ? l.leavingQuick : l.leaving))}
    >
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false" {...sx(l.lip)}>
        <path d={LIP} fill="currentColor" />
      </svg>
      <div {...sx(l.content)}>
        <p {...sx(l.kicker)}>Lim's playground</p>
        <h2 id="lim-loader-title" {...sx(l.title)}>
          Setting the <span {...sx(l.titleAccent)}>jelly</span>
        </h2>
        <div {...sx(l.scene)}>
          <div {...sx(l.trackWrap, pokes > 0 && (pokes % 2 ? l.jiggleA : l.jiggleB))}>
            <div
              role="progressbar"
              aria-labelledby="lim-loader-title"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent(done)}
              aria-valuetext={`${percent(done)}%, ${line}`}
              {...sx(l.track)}
            >
              <div {...sx(l.fill)} style={fillAt(done)}>
                <span {...sx(l.gloss)} />
                {BUBBLES.map((b) => (
                  <span key={b.right} {...sx(l.bubble)} style={{ right: b.right, animationDelay: b.delay }} />
                ))}
              </div>
            </div>
          </div>
          <div {...sx(l.rider)} style={{ transform: `translateX(${(done * 100).toFixed(2)}%)` }}>
            <div {...sx(l.seat)}>
              <span {...sx(l.shadow, leaving && l.shadowGone)} />
              <button type="button" aria-label="Poke Lim" onClick={poke} {...sx(l.poke)}>
                <span {...sx(l.hop, leaving && l.leap)}>
                  <span {...sx(l.squish, pokes > 0 && (pokes % 2 ? l.squishA : l.squishB))}>
                    <LimArt mood={leaving || giggling ? 'happy' : 'idle'} {...sx(l.art)} />
                  </span>
                </span>
              </button>
              {pokes > 0 && (
                <span key={pokes} aria-hidden="true" {...sx(l.word, done > 0.55 && l.wordLeft)}>
                  {POKES[(pokes - 1) % POKES.length]}
                </span>
              )}
            </div>
          </div>
        </div>
        <p role="status" {...sx(l.status)}>
          <span>{line}</span>
          <span aria-hidden="true" {...sx(l.percent)}>
            {percent(done)}%
          </span>
        </p>
        <button type="button" autoFocus onClick={onSkip} {...sx(l.chatFirst)}>
          <MessageCircle size={18} aria-hidden="true" />
          Chat first
        </button>
        <p {...sx(l.hint)}>Lim hops in when it's ready.</p>
      </div>
    </div>
  )
}

/** On the stage while the visitor chats first: how far Lim has come, then a cheer when it arrives. */
export function LoadPill({ state }: { state: LoaderState }) {
  const arrived = state.phase === 'gone' && state.late
  if (state.phase !== 'chat-first' && !arrived) return null
  const done = state.phase === 'chat-first' ? state.done : 1
  return (
    <div aria-hidden="true" {...sx(p.root, arrived && p.arrived)}>
      <span {...sx(p.track)}>
        <span {...sx(p.fill)} style={fillAt(done)} />
      </span>
      {arrived ? (
        <span>Lim's here</span>
      ) : (
        <>
          <span>Lim is on the way</span>
          <span {...sx(p.percent)}>{percent(done)}%</span>
        </>
      )}
    </div>
  )
}
