/**
 * BoxVisualization — Box Breathing visualization.
 *
 * An ethereal box: a squircle that breathes (subtle 1 → 1.04 scale over the
 * round), traced by a luminous brass thread with a comet trail behind the
 * leading light, ring ripples that emanate from each phase-transition marker
 * as the breath turns, and a quiet ambient bloom under the brass.
 *
 * Phase → quarter mapping (clockwise from bottom-left):
 *   0 Inhale   → left quarter, bottom → top    | box scale 1.00 → 1.04
 *   1 Hold-in  → top quarter,  left → right    | box scale 1.04
 *   2 Exhale   → right quarter, top → bottom   | box scale 1.04 → 1.00
 *   3 Hold-out → bottom quarter, right → left  | box scale 1.00
 *
 * Implementation notes:
 * - Single `<path>` with `pathLength="400"` so each quarter is exactly 100
 *   normalized units regardless of geometric path length.
 * - Three stroke layers (ambient bloom → tight glow → crisp brass) all share
 *   the same `stroke-dashoffset` so they reveal in lockstep.
 * - The whole visualization sits inside a `breathScaleGroup` whose transform
 *   gently expands during inhale and contracts during exhale, giving the
 *   silhouette a heartbeat of its own. Everything inside scales together so
 *   the light, trail, markers, and brass stay perfectly aligned.
 * - A comet trail of 4 small brass dots fades behind the leading light.
 * - When the light crosses a transition marker, a brass "ping" ring expands
 *   outward via Element.animate() — a small celebration of the phase change.
 * - prefers-reduced-motion: no breath scale, no glow filters, no light pulse,
 *   no trail, no ping. Static crisp frame at the current discrete progress.
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

// Squircle path: each side bows outward, corners are quadratic, no segment
// is a hard straight line. Starts at the bottom of the left side so inhale
// begins by rising up that side.
const BOX_PATH = [
  'M 8 74',
  'Q 5 50 8 26',          // left side bows outward
  'Q 8 8 26 8',           // top-left corner
  'Q 50 5 74 8',          // top side bows upward
  'Q 92 8 92 26',          // top-right corner
  'Q 95 50 92 74',         // right side bows outward
  'Q 92 92 74 92',         // bottom-right corner
  'Q 50 95 26 92',         // bottom side bows downward
  'Q 8 92 8 74',           // bottom-left corner
  'Z',
].join(' ')

const PATH_LENGTH = 400
const PER_PHASE = PATH_LENGTH / 4

// Trail gaps in normalized pathLength units behind the leading light.
const TRAIL_GAPS = [4, 9, 15, 23]
const TRAIL_OPACITIES = [0.7, 0.5, 0.34, 0.2]
const TRAIL_RADII = [1.6, 1.3, 1.05, 0.8]

const DEFAULT_PRIMARY = '#B8860B'
const DEFAULT_SECONDARY = '#D6AD47'

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Cumulative draw in normalized pathLength units (0..PATH_LENGTH). */
function cumulativeDraw(phaseIndex: number | null, progress: number): number {
  if (phaseIndex === null || phaseIndex < 0) return 0
  const clampedPhase = Math.min(phaseIndex, 3)
  return clampedPhase * PER_PHASE + clamp01(progress) * PER_PHASE
}

/** Subtle breath-scale curve over the four phases. */
function breathScale(phaseIndex: number | null, progress: number): number {
  if (phaseIndex === null) return 1
  const p = clamp01(progress)
  switch (phaseIndex) {
    case 0: return 1 + 0.04 * p          // inhale: 1.00 → 1.04
    case 1: return 1.04                   // hold-in: peak
    case 2: return 1.04 - 0.04 * p        // exhale: 1.04 → 1.00
    case 3: return 1                      // hold-out: rest
    default: return 1
  }
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
  const bloomRef = useRef<SVGPathElement | null>(null)
  const brassRef = useRef<SVGPathElement | null>(null)
  const glowRef = useRef<SVGPathElement | null>(null)
  const lightRef = useRef<SVGGElement | null>(null)
  const breathGroupRef = useRef<SVGGElement | null>(null)
  const markerRefs = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const pingRefs = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const trailRefs = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const lastPingedAtRef = useRef<number[]>([0, 0, 0, 0])
  const geometricLengthRef = useRef<number>(0)

  // Phase-transition marker positions on the path. Computed once on mount.
  const [transitions, setTransitions] = useState<{ x: number; y: number }[]>([])

  const phaseStartedAtRef = useRef<number>(0)
  const lastTickProgressRef = useRef<number>(0)

  const primary = themeColors?.[0] ?? DEFAULT_PRIMARY
  const secondary = themeColors?.[1] ?? DEFAULT_SECONDARY

  const discreteProgress = phaseDuration > 0
    ? clamp01(1 - timeRemaining / phaseDuration)
    : 0

  // Measure path geometry + snapshot transition points once on mount.
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    geometricLengthRef.current = len
    const points: { x: number; y: number }[] = []
    for (let i = 1; i <= 4; i += 1) {
      const d = (i / 4) * len
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

    // Brass and glow paths reveal in lockstep.
    for (const ref of [bloomRef, glowRef, brassRef]) {
      if (ref.current) ref.current.style.strokeDashoffset = String(offset)
    }

    // Subtle breath-scale on the whole visualization.
    const breath = breathGroupRef.current
    if (breath) {
      const s = reducedMotion ? 1 : breathScale(phaseIndex, progress)
      // Scale around the center of the viewBox (50,50).
      breath.setAttribute('transform', `translate(50 50) scale(${s}) translate(-50 -50)`)
    }

    const realLen = geometricLengthRef.current
    const path = pathRef.current

    // Traveling light at the leading edge.
    const light = lightRef.current
    if (light) {
      if (phaseIndex === null || phaseIndex < 0 || phaseIndex > 3 || realLen <= 0 || !path) {
        light.style.opacity = '0'
      } else {
        const dist = (cumulative / PATH_LENGTH) * realLen
        const pt = path.getPointAtLength(dist)
        light.setAttribute('transform', `translate(${pt.x} ${pt.y})`)
        light.style.opacity = isActive && !isPaused && !reducedMotion ? '1' : '0.45'
      }
    }

    // Comet trail behind the leading light.
    if (path && realLen > 0 && phaseIndex !== null && !reducedMotion) {
      for (let i = 0; i < TRAIL_GAPS.length; i += 1) {
        const dot = trailRefs.current[i]
        if (!dot) continue
        const trailCumulative = cumulative - TRAIL_GAPS[i]
        if (trailCumulative <= 0) {
          dot.style.opacity = '0'
          continue
        }
        const trailDist = (trailCumulative / PATH_LENGTH) * realLen
        const pt = path.getPointAtLength(trailDist)
        dot.setAttribute('cx', String(pt.x))
        dot.setAttribute('cy', String(pt.y))
        dot.style.opacity = String(TRAIL_OPACITIES[i] * (isPaused ? 0.45 : 1))
      }
    } else {
      for (const dot of trailRefs.current) {
        if (dot) dot.style.opacity = '0'
      }
    }

    // Brighten upcoming transition marker as we approach it; ping it on
    // arrival.
    for (let i = 0; i < 4; i += 1) {
      const marker = markerRefs.current[i]
      if (!marker) continue
      const isUpcoming = phaseIndex !== null && i === phaseIndex
      const base = 0.32
      const intensity = isUpcoming ? base + (1 - base) * clamp01(progress) : base
      marker.style.opacity = String(intensity)
      const scale = isUpcoming ? 1 + 0.55 * clamp01(progress) : 1
      marker.setAttribute('r', String(2.2 * scale))

      // Ring ripple when the leading light crosses this marker.
      if (
        isUpcoming &&
        !reducedMotion &&
        progress >= 0.985 &&
        isActive &&
        !isPaused
      ) {
        const now = performance.now()
        if (now - lastPingedAtRef.current[i] > 1500) {
          lastPingedAtRef.current[i] = now
          const ring = pingRefs.current[i]
          if (ring && typeof ring.animate === 'function') {
            ring.animate(
              [
                { r: '2.2', opacity: '0.85' },
                { r: '7.5', opacity: '0' },
              ] as unknown as Keyframe[],
              { duration: 760, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            )
          }
        }
      }
    }
  }

  // RAF loop. The full loop runs whenever the session is breathing; otherwise
  // we paint a single static frame.
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

  // Initial paint after refs settle.
  useEffect(() => {
    applyFrame(reducedMotion ? discreteProgress : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIndex, currentRound, reducedMotion, transitions])

  // Stable IDs for SVG defs.
  const tightGlowId = 'box-viz-tight-glow'
  const bloomId = 'box-viz-bloom'
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
        {/* Tight Gaussian halo — the glow ring around the brass thread. */}
        {!reducedMotion && (
          <>
            <filter id={tightGlowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
            {/* Ambient bloom — softer, wider halo for an ethereal underlayer. */}
            <filter id={bloomId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </>
        )}
        <radialGradient id={haloId}>
          <stop offset="0%" stopColor={primary} stopOpacity="0.95" />
          <stop offset="35%" stopColor={primary} stopOpacity="0.55" />
          <stop offset="100%" stopColor={primary} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={brassGradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={primary} />
          <stop offset="100%" stopColor={secondary} />
        </linearGradient>
      </defs>

      {/* Everything inside this group breathes — gently scales 1 ↔ 1.04 over
          the round so the silhouette feels alive. */}
      <g ref={breathGroupRef} data-testid="box-breath-group">

        {/* Ambient bloom — very soft, wide, under everything. */}
        <path
          ref={bloomRef}
          d={BOX_PATH}
          pathLength={PATH_LENGTH}
          fill="none"
          stroke={primary}
          strokeWidth={10}
          strokeLinecap="round"
          opacity={reducedMotion ? 0 : 0.18}
          filter={reducedMotion ? undefined : `url(#${bloomId})`}
          style={{
            strokeDasharray: PATH_LENGTH,
            strokeDashoffset: PATH_LENGTH,
          }}
          data-testid="box-bloom"
        />

        {/* Hairline base — barely visible ink frame, also the reference path
            for getTotalLength / getPointAtLength. */}
        <path
          ref={pathRef}
          d={BOX_PATH}
          pathLength={PATH_LENGTH}
          fill="none"
          stroke="var(--bw-border)"
          strokeWidth={0.8}
          data-testid="box-base"
        />

        {/* Tight glow halo around the brass thread. */}
        <path
          ref={glowRef}
          d={BOX_PATH}
          pathLength={PATH_LENGTH}
          fill="none"
          stroke={primary}
          strokeWidth={5.5}
          strokeLinecap="round"
          opacity={reducedMotion ? 0 : 0.42}
          filter={reducedMotion ? undefined : `url(#${tightGlowId})`}
          style={{
            strokeDasharray: PATH_LENGTH,
            strokeDashoffset: PATH_LENGTH,
          }}
          data-testid="box-glow"
        />

        {/* Crisp brass trace. */}
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

        {/* Phase-transition markers + ping rings. Each marker has an unfilled
            sibling ring that expands outward when the light arrives. */}
        {transitions.map((pt, i) => (
          <g key={`transition-${i}`}>
            <circle
              ref={(el) => { pingRefs.current[i] = el }}
              cx={pt.x}
              cy={pt.y}
              r={2.2}
              fill="none"
              stroke={primary}
              strokeWidth={1.2}
              style={{ opacity: 0 }}
              data-testid={`box-transition-ping-${i}`}
            />
            <circle
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
          </g>
        ))}

        {/* Comet trail — small brass dots fading behind the leading light. */}
        {TRAIL_GAPS.map((_, i) => (
          <circle
            key={`trail-${i}`}
            ref={(el) => { trailRefs.current[i] = el }}
            r={TRAIL_RADII[i]}
            cx={8}
            cy={74}
            fill={primary}
            data-testid={`box-trail-${i}`}
            style={{ opacity: 0 }}
          />
        ))}

        {/* Traveling light at the leading edge. */}
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
