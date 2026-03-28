import { memo, useMemo } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import type { TechniqueId } from '@/lib/constants'
import { getTechniqueRingColor } from '@/lib/techniqueConfig'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'

interface ConcentricRingsProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  techniqueId: TechniqueId
  className?: string
  onClick?: () => void
}

const CENTER = 100
const VIEW_SIZE = 200

function isHoldPhase(phase: BreathPhase | null): boolean {
  if (!phase) return false
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT || phase === BREATH_PHASES.REST
}

/**
 * Generate an organic blob path using perturbed circle with smooth cubic beziers.
 * Uses a seeded pseudo-noise for deterministic shapes per layer.
 */
function blobPath(
  cx: number,
  cy: number,
  baseRadius: number,
  points: number,
  seed: number,
  wobble: number,
): string {
  // Simple seeded pseudo-random for deterministic shapes
  const noise = (angle: number, s: number): number => {
    const x = Math.sin(angle * 3.7 + s * 17.3) * 43758.5453
    return (x - Math.floor(x)) * 2 - 1 // -1 to 1
  }

  // Generate perturbed points around the circle
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const r = baseRadius + noise(angle, seed) * wobble
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    })
  }

  // Convert to smooth cubic bezier using Catmull-Rom → Bezier conversion
  const n = pts.length
  const segments: string[] = []

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]

    // Catmull-Rom to cubic bezier control points (tension = 0, alpha = 0.5)
    const tension = 6 // Higher = smoother curves
    const cp1x = p1.x + (p2.x - p0.x) / tension
    const cp1y = p1.y + (p2.y - p0.y) / tension
    const cp2x = p2.x - (p3.x - p1.x) / tension
    const cp2y = p2.y - (p3.y - p1.y) / tension

    if (i === 0) {
      segments.push(`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`)
    }
    segments.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    )
  }

  segments.push('Z')
  return segments.join(' ')
}

export const ConcentricRings = memo(function ConcentricRings({
  phase,
  amplitude,
  isActive: _isActive,
  techniqueId,
  className,
  onClick,
}: ConcentricRingsProps) {
  const reducedMotion = useReducedMotion()

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const ringColors = getTechniqueRingColor(techniqueId, isDark)

  // Bucket amplitude to ~10 steps to avoid constant path recalculation
  const ampBucket = Math.round(amplitude * 10) / 10

  // Generate blob paths that morph subtly with amplitude
  const blobPaths = useMemo(() => {
    // Wobble modulates with amplitude: contracting = rounder, expanding = more organic
    const wobbleMod = 1 + ampBucket * 0.3
    return {
      outer: blobPath(CENTER, CENTER, 70, 7, 1.0, 12 * wobbleMod),
      middle: blobPath(CENTER, CENTER, 50, 6, 2.5, 8 * wobbleMod),
      core: blobPath(CENTER, CENTER, 30, 5, 4.2, 5 * wobbleMod),
    }
  }, [ampBucket])

  // Inhale expands, exhale contracts — mirrors natural breathing
  const hold = isHoldPhase(phase)
  const amp = hold ? amplitude * 0.4 : amplitude

  const coreScale = 0.55 + amp * 0.55       // exhale ~0.66 → inhale ~1.10
  const middleScale = 0.40 + amp * 0.70     // exhale ~0.54 → inhale ~1.10
  const outerScale = 0.30 + amp * 0.85      // exhale ~0.47 → inhale ~1.15

  // Opacity: expand = denser (more opaque), contract = thinner (more transparent)
  const coreOpacity = 0.10 + amp * 0.22     // 0.14 → 0.32
  const middleOpacity = 0.06 + amp * 0.16   // 0.09 → 0.22
  const outerOpacity = 0.03 + amp * 0.12    // 0.05 → 0.15

  const breathTransition = reducedMotion
    ? undefined
    : 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)'

  const rotationStyle = (duration: string, reverse = false): React.CSSProperties =>
    reducedMotion
      ? {}
      : {
          animation: `spin-slow ${duration} linear infinite${reverse ? ' reverse' : ''}`,
          transformOrigin: `${CENTER}px ${CENTER}px`,
        }

  const scaleStyle = (scale: number): React.CSSProperties => ({
    transform: `translate(${CENTER}px, ${CENTER}px) scale(${scale}) translate(${-CENTER}px, ${-CENTER}px)`,
    transition: breathTransition,
  })

  return (
    <svg
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      role="img"
      aria-label={
        phase
          ? `Breathing visualization: ${phase.replace('_', ' ')} phase`
          : 'Breathing visualization: ready'
      }
      className={cn('text-bw', className)}
      onClick={onClick}
      data-testid="concentric-rings"
    >
      <defs>
        <radialGradient id="blobGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ringColors.secondary} stopOpacity="0.9" />
          <stop offset="60%" stopColor={ringColors.primary} stopOpacity="0.6" />
          <stop offset="100%" stopColor={ringColors.primary} stopOpacity="0" />
        </radialGradient>

        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      {/* Layer 1 (back): Outer blob — largest, most transparent, most movement */}
      <g style={scaleStyle(outerScale)}>
        <g style={rotationStyle('90s')}>
          <path
            d={blobPaths.outer}
            fill={ringColors.secondary}
            opacity={outerOpacity}
            filter="url(#softGlow)"
          />
        </g>
      </g>

      {/* Layer 2 (mid): Middle blob — medium size, moderate opacity */}
      <g style={scaleStyle(middleScale)}>
        <g style={rotationStyle('70s', true)}>
          <path
            d={blobPaths.middle}
            fill={ringColors.primary}
            opacity={middleOpacity}
          />
        </g>
      </g>

      {/* Layer 3 (front): Core blob — smallest, densest, least movement */}
      <g style={scaleStyle(coreScale)}>
        <g style={rotationStyle('50s')}>
          <path
            d={blobPaths.core}
            fill="url(#blobGradient)"
            opacity={coreOpacity}
          />
        </g>
      </g>
    </svg>
  )
})
