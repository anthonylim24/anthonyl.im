/**
 * BoxVisualization — Box Breathing visualization.
 *
 * An ethereal "box" — a softly-curved squircle (not a hard rectangle) traced
 * by a luminous brass thread, one quarter of the perimeter per breath phase.
 * A glowing light rides at the leading edge, pulsing gently. The visual is
 * deliberately tuned to echo the orb's soft, living quality — the box is
 * still recognizable as a box, but it breathes.
 *
 * Phase → quarter mapping (clockwise from bottom-left, matching the natural
 * "inhale rises, exhale falls" metaphor):
 *   0 Inhale   → left quarter, bottom → top
 *   1 Hold-in  → top quarter,  left → right
 *   2 Exhale   → right quarter, top → bottom
 *   3 Hold-out → bottom quarter, right → left
 *
 * Implementation notes:
 * - Single `<path>` with `pathLength="400"` so each quarter is exactly 100
 *   normalized units regardless of geometric path length. The brass is
 *   revealed by shrinking the path's stroke-dashoffset from 400 → 0 over
 *   the full round.
 * - Layered strokes for the glow: a wider, blurred halo path + a crisp
 *   brass path share the same dashoffset, so they reveal in lockstep.
 * - The traveling light is positioned with `getPointAtLength` against the
 *   real geometric path so it tracks the soft corners naturally.
 * - Honors `prefers-reduced-motion`: no RAF loop, no light pulse, no glow
 *   filter (collapses to a static crisp frame at the current discrete
 *   progress).
 * - `themeColors` lets the brass pick up the user's selected orb theme,
 *   so the visualization matches the rest of the session aesthetic.
 */
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'

interface BoxVisualizationProps {
  phaseIndex: number | null
  phaseDuration: number
  timeRemaining: number
  isActive: boolean
  isPaused: boolean
  currentRound: number
  themeColors?: [string, string]
  className?: string
  onClick?: () => void
  ariaLabel: string
  interactiveAriaLabel?: string
}

// Squircle-ish path: each side gently bows outward (Q control points pulled
// 3-4 units past the bounding rect), corners are quadratic, no segment is a
// hard straight line. Starts at the mid-point of the bottom-left arc so the
// "inhale rises" phase begins by going UP the left side.
const BOX_PATH = [
  'M 8 74',
  'Q 5 50 8 26',          // left side bows outward (organic)
  'Q 8 8 26 8',           // top-left corner
  'Q 50 5 74 8',          // top side bows upward
  'Q 92 8 92 26',          // top-right corner
  'Q 95 50 92 74',         // right side bows outward
  'Q 92 92 74 92',         // bottom-right corner
  'Q 50 95 26 92',         // bottom side bows downward
  'Q 8 92 8 74',           // bottom-left corner
  'Z',
].join(' ')

// Normalized path length — every phase covers exactly 100 of these units.
const PATH_LENGTH = 400
const PER_PHASE = PATH_LENGTH / 4

const DEFAULT_PRIMARY = '#B8860B'      // --bw-accent (brass)
const DEFAULT_SECONDARY = '#D6AD47'    // --bw-accent-light

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** How much of the full perimeter (in normalized units, 0..PATH_LENGTH)
 *  has been drawn at the given phase/progress. */
function cumulativeDraw(phaseIndex: number | null, progress: number): number {
  if (phaseIndex === null || phaseIndex < 0) return 0
  const clampedPhase = Math.min(phaseIndex, 3)
  return clampedPhase * PER_PHASE + clamp01(progress) * PER_PHASE
}

export function BoxVisualization({
  phaseIndex,
  phaseDuration,
  timeRemaining,
  isActive,
  isPaused,
  currentRound,
  themeColors,
  className,
  onClick,
  ariaLabel,
  interactiveAriaLabel,
}: BoxVisualizationProps) {
  const reducedMotion = useReducedMotion()
  const pathRef = useRef<SVGPathElement | null>(null)
  const brassRef = useRef<SVGPathElement | null>(null)
  const glowRef = useRef<SVGPathElement | null>(null)
  const lightRef = useRef<SVGGElement | null>(null)
  const markerRefs = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const geometricLengthRef = useRef<number>(0)

  // Phase-transition marker positions on the path. Computed once on mount via
  // getPointAtLength so they sit exactly where the breath turns from one
  // phase to the next.
  const [transitions, setTransitions] = useState<{ x: number; y: number }[]>([])

  const phaseStartedAtRef = useRef<number>(0)
  const lastTickProgressRef = useRef<number>(0)

  const primary = themeColors?.[0] ?? DEFAULT_PRIMARY
  const secondary = themeColors?.[1] ?? DEFAULT_SECONDARY

  const discreteProgress = phaseDuration > 0
    ? clamp01(1 - timeRemaining / phaseDuration)
    : 0

  // Measure the path geometry once and snapshot the four transition points
  // so the markers and the light agree on "where the breath turns."
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    geometricLengthRef.current = len
    // Markers sit at pathLength 100/200/300/400 — i.e., the end of each
    // phase. Marker index N sits at the END of phase N (transition into
    // phase N+1, wrapping at 3 → 0).
    const points: { x: number; y: number }[] = []
    for (let i = 1; i <= 4; i += 1) {
      const d = (i / 4) * len
      // getPointAtLength on the last point wraps to the path start (Z), so
      // we lift it slightly before 1.0 to get a stable end-of-loop position.
      const safe = i === 4 ? Math.max(0, d - 0.0001) : d
      const pt = path.getPointAtLength(safe)
      points.push({ x: pt.x, y: pt.y })
    }
    setTransitions(points)
  }, [])

  useEffect(() => {
    const elapsedMs = clamp01(discreteProgress) * phaseDuration * 1000
    phaseStartedAtRef.current = performance.now() - elapsedMs
    lastTickProgressRef.current = discreteProgress
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIndex, currentRound, phaseDuration])

  useEffect(() => {
    if (discreteProgress > lastTickProgressRef.current) {
      const elapsedMs = discreteProgress * phaseDuration * 1000
      phaseStartedAtRef.current = performance.now() - elapsedMs
      lastTickProgressRef.current = discreteProgress
    }
  }, [discreteProgress, phaseDuration])

  function applyFrame(progress: number) {
    const cumulative = cumulativeDraw(phaseIndex, progress)
    const offset = PATH_LENGTH - cumulative

    // Both glow + crisp paths reveal in lockstep.
    if (brassRef.current) {
      brassRef.current.style.strokeDashoffset = String(offset)
    }
    if (glowRef.current) {
      glowRef.current.style.strokeDashoffset = String(offset)
    }

    const light = lightRef.current
    if (!light) return
    if (phaseIndex === null || phaseIndex < 0 || phaseIndex > 3) {
      light.style.opacity = '0'
      return
    }
    const realLen = geometricLengthRef.current
    if (realLen > 0 && pathRef.current) {
      const dist = (cumulative / PATH_LENGTH) * realLen
      const pt = pathRef.current.getPointAtLength(dist)
      light.setAttribute('transform', `translate(${pt.x} ${pt.y})`)
    }
    light.style.opacity = isActive && !isPaused && !reducedMotion ? '1' : '0.45'

    // Brighten the upcoming transition marker as we approach it. The marker
    // at the end of the *current* phase is the next one the light will hit.
    for (let i = 0; i < 4; i += 1) {
      const marker = markerRefs.current[i]
      if (!marker) continue
      const isUpcoming = phaseIndex !== null && i === phaseIndex
      // Base opacity sits low so markers feel like quiet landmarks; the
      // upcoming one ramps from base → 1 as the light closes in.
      const base = 0.32
      const intensity = isUpcoming ? base + (1 - base) * clamp01(progress) : base
      marker.style.opacity = String(intensity)
      // The upcoming marker also scales slightly as it brightens.
      const scale = isUpcoming ? 1 + 0.55 * clamp01(progress) : 1
      marker.setAttribute('r', String(2.2 * scale))
    }
  }

  // RAF loop — writes attributes directly to DOM, bypassing React state.
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

  // Initial paint — ensure correct frame before the first RAF tick fires.
  // Depends on `transitions` so we re-paint once the marker positions have
  // been measured and the marker refs are attached.
  useEffect(() => {
    applyFrame(reducedMotion ? discreteProgress : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIndex, currentRound, reducedMotion, transitions])

  // Stable IDs for SVG defs. Only one BoxVisualization renders at a time,
  // so global IDs are safe.
  const glowId = 'box-viz-glow'
  const haloId = 'box-viz-halo'
  const brassGradId = 'box-viz-brass-grad'

  const visualization = (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={cn('w-full h-full overflow-visible', className)}
      aria-hidden={onClick ? true : undefined}
      role={onClick ? undefined : 'img'}
      aria-label={onClick ? undefined : ariaLabel}
      data-testid="box-visualization"
      data-phase-index={phaseIndex ?? -1}
    >
      <defs>
        {/* Soft Gaussian halo for the brass path. Disabled under reduced
            motion so users sensitive to bloom effects get a clean line. */}
        {!reducedMotion && (
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        )}
        {/* Radial halo for the traveling light. */}
        <radialGradient id={haloId}>
          <stop offset="0%" stopColor={primary} stopOpacity="0.95" />
          <stop offset="35%" stopColor={primary} stopOpacity="0.55" />
          <stop offset="100%" stopColor={primary} stopOpacity="0" />
        </radialGradient>
        {/* Brass color blend so the trace shifts subtly along its length
            from primary → secondary, echoing the orb's color blend. */}
        <linearGradient id={brassGradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={primary} />
          <stop offset="100%" stopColor={secondary} />
        </linearGradient>
      </defs>

      {/* Hairline base — barely visible ink frame, hints at the path.
          Also serves as the reference path for getTotalLength /
          getPointAtLength so the traveling light tracks the soft curve. */}
      <path
        ref={pathRef}
        d={BOX_PATH}
        pathLength={PATH_LENGTH}
        fill="none"
        stroke="var(--bw-border)"
        strokeWidth={0.8}
        data-testid="box-base"
      />

      {/* Soft glow halo — wide, blurred, beneath the crisp brass.
          Filter is omitted under reduced motion. */}
      <path
        ref={glowRef}
        d={BOX_PATH}
        pathLength={PATH_LENGTH}
        fill="none"
        stroke={primary}
        strokeWidth={5.5}
        strokeLinecap="round"
        opacity={reducedMotion ? 0 : 0.4}
        filter={reducedMotion ? undefined : `url(#${glowId})`}
        style={{
          strokeDasharray: PATH_LENGTH,
          strokeDashoffset: PATH_LENGTH,
        }}
        data-testid="box-glow"
      />

      {/* Crisp brass trace — the visible "ink" of the breath. */}
      <path
        ref={brassRef}
        d={BOX_PATH}
        pathLength={PATH_LENGTH}
        fill="none"
        stroke={`url(#${brassGradId})`}
        strokeWidth={1.8}
        strokeLinecap="round"
        style={{
          strokeDasharray: PATH_LENGTH,
          strokeDashoffset: PATH_LENGTH,
        }}
        data-testid="box-brass"
      />

      {/* Phase-transition markers — quiet brass landmarks at the four points
          where the breath turns into the next phase. The upcoming marker
          (end of the current phase) ramps up in opacity + scale as the
          light closes in, so the user sees the transition coming. */}
      {transitions.map((pt, i) => (
        <circle
          key={`transition-${i}`}
          ref={(el) => { markerRefs.current[i] = el }}
          cx={pt.x}
          cy={pt.y}
          r={2.2}
          fill="var(--bw-canvas)"
          stroke={primary}
          strokeWidth={1.1}
          data-testid={`box-transition-${i}`}
          style={{ opacity: 0.32, transition: 'opacity 180ms ease-out' }}
        />
      ))}

      {/* Traveling light at the leading edge — halo + bright core, with a
          gentle pulse that echoes the orb's breath. */}
      <g
        ref={lightRef}
        data-testid="box-light"
        style={{ opacity: 0 }}
      >
        <g className={reducedMotion ? undefined : 'box-light-pulse'}>
          <circle r={4.5} fill={`url(#${haloId})`} />
          <circle r={1.4} fill={primary} />
        </g>
      </g>
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
