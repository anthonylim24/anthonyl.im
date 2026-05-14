/**
 * BoxVisualization — Box Breathing visualization.
 *
 * Renders a 4-sided ink box where each side traces a brass light during
 * its corresponding breath phase. One side per phase, drawn over the phase's
 * full duration, completing the box across the four phases of a round.
 *
 * Phase → side mapping (clockwise from bottom-left, matching the natural
 * "inhale rises, exhale falls" metaphor):
 *   0 Inhale   → left side, bottom → top
 *   1 Hold-in  → top side, left → right
 *   2 Exhale   → right side, top → bottom
 *   3 Hold-out → bottom side, right → left
 *
 * Honors prefers-reduced-motion (instant fill, no traveling light).
 * Drives motion with RAF so it stays smooth between 1Hz timer ticks and
 * naturally pauses when `isPaused` is true (timeRemaining stops advancing).
 *
 * Implementation note: each brass overlay line has its endpoint moved
 * dynamically rather than relying on stroke-dasharray. dasharray interacts
 * unpredictably with `vector-effect: non-scaling-stroke` (the dash values
 * stay in screen units while the path stays in user units), and moving the
 * endpoint is simpler and immune to that interaction.
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'

interface BoxVisualizationProps {
  phaseIndex: number | null
  phaseDuration: number
  timeRemaining: number
  isActive: boolean
  isPaused: boolean
  currentRound: number
  className?: string
  onClick?: () => void
  ariaLabel: string
  interactiveAriaLabel?: string
}

// SVG geometry — 100x100 viewBox, 8 inset for stroke half-width breathing room.
const INSET = 8
const SIZE = 100
const LO = INSET
const HI = SIZE - INSET
const SIDE_LEN = HI - LO

interface SideDef {
  // Start corner — where the phase begins.
  sx: number; sy: number
  // End corner — where the phase ends.
  ex: number; ey: number
  // Interpolate a point along the side at progress p ∈ [0,1].
  at: (p: number) => { x: number; y: number }
}

const SIDES: SideDef[] = [
  // 0 — Inhale: left side, bottom → top
  {
    sx: LO, sy: HI, ex: LO, ey: LO,
    at: (p) => ({ x: LO, y: HI - SIDE_LEN * p }),
  },
  // 1 — Hold-in: top side, left → right
  {
    sx: LO, sy: LO, ex: HI, ey: LO,
    at: (p) => ({ x: LO + SIDE_LEN * p, y: LO }),
  },
  // 2 — Exhale: right side, top → bottom
  {
    sx: HI, sy: LO, ex: HI, ey: HI,
    at: (p) => ({ x: HI, y: LO + SIDE_LEN * p }),
  },
  // 3 — Hold-out: bottom side, right → left
  {
    sx: HI, sy: HI, ex: LO, ey: HI,
    at: (p) => ({ x: HI - SIDE_LEN * p, y: HI }),
  },
]

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** How much of `sideIndex` should be drawn right now, in [0,1]. */
function getSideFill(sideIndex: number, phaseIndex: number | null, progress: number): number {
  if (phaseIndex === null || phaseIndex < 0) return 0
  if (sideIndex < phaseIndex) return 1
  if (sideIndex === phaseIndex) return clamp01(progress)
  return 0
}

export function BoxVisualization({
  phaseIndex,
  phaseDuration,
  timeRemaining,
  isActive,
  isPaused,
  currentRound,
  className,
  onClick,
  ariaLabel,
  interactiveAriaLabel,
}: BoxVisualizationProps) {
  const reducedMotion = useReducedMotion()
  const sideRefs = useRef<(SVGLineElement | null)[]>([null, null, null, null])
  const lightRef = useRef<SVGCircleElement | null>(null)

  const phaseStartedAtRef = useRef<number>(0)
  const lastTickProgressRef = useRef<number>(0)

  const discreteProgress = phaseDuration > 0
    ? clamp01(1 - timeRemaining / phaseDuration)
    : 0

  // Anchor the RAF start time when phase / round / phaseDuration changes so we
  // don't visually rewind on the first frame after a re-render.
  useEffect(() => {
    const elapsedMs = clamp01(discreteProgress) * phaseDuration * 1000
    phaseStartedAtRef.current = performance.now() - elapsedMs
    lastTickProgressRef.current = discreteProgress
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIndex, currentRound, phaseDuration])

  // If a 1Hz timer tick reports more progress than RAF has reached, snap
  // forward so the light never lags the count-down.
  useEffect(() => {
    if (discreteProgress > lastTickProgressRef.current) {
      const elapsedMs = discreteProgress * phaseDuration * 1000
      phaseStartedAtRef.current = performance.now() - elapsedMs
      lastTickProgressRef.current = discreteProgress
    }
  }, [discreteProgress, phaseDuration])

  function applyFrame(progress: number) {
    for (let i = 0; i < 4; i += 1) {
      const node = sideRefs.current[i]
      if (!node) continue
      const fill = getSideFill(i, phaseIndex, progress)
      const side = SIDES[i]
      if (fill <= 0) {
        // Collapse the brass line to a point at the start corner.
        node.setAttribute('x2', String(side.sx))
        node.setAttribute('y2', String(side.sy))
        node.style.opacity = '0'
      } else {
        const end = side.at(fill)
        node.setAttribute('x2', String(end.x))
        node.setAttribute('y2', String(end.y))
        node.style.opacity = '1'
      }
    }

    const light = lightRef.current
    if (!light) return
    if (phaseIndex === null || phaseIndex < 0 || phaseIndex > 3) {
      light.style.opacity = '0'
      return
    }
    const { x, y } = SIDES[phaseIndex].at(progress)
    light.setAttribute('cx', String(x))
    light.setAttribute('cy', String(y))
    light.style.opacity = isActive && !isPaused && !reducedMotion ? '1' : '0.4'
  }

  // RAF loop — writes endpoints directly to the DOM to keep React out of the
  // hot path. Pauses cleanly when isPaused via the effect dependency.
  useEffect(() => {
    if (reducedMotion || !isActive || isPaused || phaseIndex === null) {
      applyFrame(discreteProgress)
      return
    }
    let frame = 0
    const loop = () => {
      const now = performance.now()
      const phaseMs = Math.max(phaseDuration * 1000, 1)
      const elapsed = now - phaseStartedAtRef.current
      const p = clamp01(elapsed / phaseMs)
      applyFrame(p)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, isActive, isPaused, phaseIndex, phaseDuration, currentRound])

  // Initial paint — ensure the SVG renders the correct frame before RAF fires.
  useEffect(() => {
    applyFrame(reducedMotion ? discreteProgress : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIndex, currentRound, reducedMotion])

  const visualization = (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      preserveAspectRatio="none"
      className={cn('w-full h-full', className)}
      aria-hidden={onClick ? true : undefined}
      role={onClick ? undefined : 'img'}
      aria-label={onClick ? undefined : ariaLabel}
      data-testid="box-visualization"
      data-phase-index={phaseIndex ?? -1}
    >
      {/* Hairline base box — always visible, defines the ink frame. */}
      {SIDES.map((s, i) => (
        <line
          key={`base-${i}`}
          x1={s.sx}
          y1={s.sy}
          x2={s.ex}
          y2={s.ey}
          stroke="var(--bw-border)"
          strokeWidth={1}
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Brass overlay — endpoint moves dynamically. Sides start collapsed at
          their start corner; applyFrame extends them according to side state. */}
      {SIDES.map((s, i) => (
        <line
          key={`brass-${i}`}
          data-testid={`box-side-${i}`}
          ref={(el) => { sideRefs.current[i] = el }}
          x1={s.sx}
          y1={s.sy}
          x2={s.sx}
          y2={s.sy}
          stroke="var(--bw-accent)"
          strokeWidth={2}
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
          style={{ opacity: 0 }}
        />
      ))}
      {/* Traveling brass light at the leading edge — small, no glow. */}
      <circle
        ref={lightRef}
        r={2}
        cx={SIDES[0].sx}
        cy={SIDES[0].sy}
        fill="var(--bw-accent)"
        data-testid="box-light"
        style={{ opacity: 0 }}
      />
      {/* Corner anchors — quietly mark the phase joints. */}
      <circle cx={LO} cy={HI} r={1.2} fill="var(--bw-border-hover, rgba(28,25,23,0.14))" />
      <circle cx={LO} cy={LO} r={1.2} fill="var(--bw-border-hover, rgba(28,25,23,0.14))" />
      <circle cx={HI} cy={LO} r={1.2} fill="var(--bw-border-hover, rgba(28,25,23,0.14))" />
      <circle cx={HI} cy={HI} r={1.2} fill="var(--bw-border-hover, rgba(28,25,23,0.14))" />
    </svg>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full flex items-center justify-center relative appearance-none border-0 bg-transparent p-0"
        aria-label={interactiveAriaLabel ?? ariaLabel}
        data-testid="box-visualization-button"
      >
        {visualization}
      </button>
    )
  }

  return visualization
}
