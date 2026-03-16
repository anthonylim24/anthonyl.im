import React, { useMemo } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import type { TechniqueId } from '@/lib/constants'
import { getTechniqueGeometry, getTechniqueRingColor, type TechniqueGeometry } from '@/lib/techniqueConfig'
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

const RING_COUNT = 8
const CENTER = 100
const VIEW_SIZE = 200
const MIN_RADIUS = 12
const MAX_RADIUS = 90

// Whether the phase is an expansion (inhale) or contraction (exhale)
function isExpandPhase(phase: BreathPhase | null): boolean {
  if (!phase) return false
  return phase === BREATH_PHASES.INHALE || phase === BREATH_PHASES.DEEP_INHALE
}

function isHoldPhase(phase: BreathPhase | null): boolean {
  if (!phase) return false
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT || phase === BREATH_PHASES.REST
}

/** Render technique-specific geometry overlay — stays monochromatic (ink) */
function GeometryOverlay({ geometry, radius }: { geometry: TechniqueGeometry; radius: number }) {
  const cx = CENTER
  const cy = CENTER

  switch (geometry) {
    case 'grid': {
      // 4x4 grid inscribed within the outermost ring
      const lines: React.ReactElement[] = []
      const step = (radius * 2) / 4
      const start = cx - radius
      const top = cy - radius
      for (let i = 0; i <= 4; i++) {
        const x = start + step * i
        const y = top + step * i
        lines.push(
          <line key={`v${i}`} x1={x} y1={top} x2={x} y2={top + radius * 2} />,
          <line key={`h${i}`} x1={start} y1={y} x2={start + radius * 2} y2={y} />,
        )
      }
      return <g className="text-bw" stroke="currentColor" strokeWidth="0.3" opacity="0.12">{lines}</g>
    }

    case 'triangle': {
      // Equilateral triangle inscribed in the ring
      const points = [0, 1, 2].map(i => {
        const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
      }).join(' ')
      return (
        <polygon
          points={points}
          fill="none"
          className="text-bw"
          stroke="currentColor"
          strokeWidth="0.4"
          opacity="0.12"
        />
      )
    }

    case 'octagram': {
      // 8-pointed star: two overlapping squares rotated 45 degrees
      const sq1 = [0, 1, 2, 3].map(i => {
        const angle = (i * Math.PI) / 2 + Math.PI / 4
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
      }).join(' ')
      const sq2 = [0, 1, 2, 3].map(i => {
        const angle = (i * Math.PI) / 2
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
      }).join(' ')
      return (
        <g className="text-bw" stroke="currentColor" strokeWidth="0.4" opacity="0.12" fill="none">
          <polygon points={sq1} />
          <polygon points={sq2} />
        </g>
      )
    }

    case 'spiral': {
      // Golden spiral approximation using logarithmic spiral
      const points: string[] = []
      const a = 1
      const b = 0.1759 // ~golden ratio growth
      const maxAngle = 6 * Math.PI
      const steps = 120
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * maxAngle
        const r = a * Math.exp(b * theta)
        const scale = radius / (a * Math.exp(b * maxAngle))
        const x = cx + r * scale * Math.cos(theta)
        const y = cy + r * scale * Math.sin(theta)
        points.push(`${x},${y}`)
      }
      return (
        <polyline
          points={points.join(' ')}
          fill="none"
          className="text-bw"
          stroke="currentColor"
          strokeWidth="0.4"
          opacity="0.12"
        />
      )
    }
  }
}

export function ConcentricRings({
  phase,
  amplitude,
  isActive: _isActive,
  techniqueId,
  className,
  onClick,
}: ConcentricRingsProps) {
  const reducedMotion = useReducedMotion()
  const geometry = getTechniqueGeometry(techniqueId)

  // Detect dark mode for ring color selection
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const ringColors = getTechniqueRingColor(techniqueId, isDark)

  // Compute ring radii based on amplitude
  const rings = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => {
      const t = i / (RING_COUNT - 1) // 0..1
      const baseRadius = MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS)

      // Expand outward on inhale, contract on exhale
      const expand = isExpandPhase(phase)
      const scale = expand
        ? 1 + amplitude * 0.25 * (0.5 + t * 0.5) // outer rings expand more
        : 1 - amplitude * 0.15 * (0.5 + t * 0.5) // outer rings contract more
      const radius = baseRadius * scale

      // Opacity: thins as rings expand, thickens as they contract
      const baseOpacity = expand
        ? 0.10 + (1 - amplitude) * 0.05
        : 0.10 + amplitude * 0.05

      // Hold phase: subtle pulse via amplitude oscillation passed from parent
      const holdPulse = isHoldPhase(phase) ? 0.10 + amplitude * 0.05 : baseOpacity

      const opacity = isHoldPhase(phase) ? holdPulse : baseOpacity

      return { radius, opacity }
    })
  }, [amplitude, phase])

  // Outermost ring radius for geometry overlay
  const outerRadius = rings[RING_COUNT - 1]?.radius ?? MAX_RADIUS

  // Rotation: 1 revolution per 60s = 6 deg/s
  const rotationStyle = reducedMotion
    ? {}
    : { animation: 'spin-slow 60s linear infinite' }

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
      {/* Crosshair axes — stay monochromatic (ink) */}
      <line
        x1={CENTER - MAX_RADIUS * 1.1}
        y1={CENTER}
        x2={CENTER + MAX_RADIUS * 1.1}
        y2={CENTER}
        stroke="currentColor"
        strokeWidth="0.3"
        opacity="0.06"
      />
      <line
        x1={CENTER}
        y1={CENTER - MAX_RADIUS * 1.1}
        x2={CENTER}
        y2={CENTER + MAX_RADIUS * 1.1}
        stroke="currentColor"
        strokeWidth="0.3"
        opacity="0.06"
      />

      {/* Concentric rings — technique-colored */}
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx={CENTER}
          cy={CENTER}
          r={ring.radius}
          fill="none"
          stroke={ringColors.primary}
          strokeWidth={i === RING_COUNT - 1 ? '0.6' : '0.4'}
          opacity={ring.opacity}
          style={reducedMotion ? undefined : { transition: 'r 0.3s ease-out, opacity 0.3s ease-out' }}
        />
      ))}

      {/* Technique geometry overlay — rotates slowly, stays monochromatic */}
      <g style={{ ...rotationStyle, transformOrigin: `${CENTER}px ${CENTER}px` }}>
        <GeometryOverlay geometry={geometry} radius={outerRadius * 0.95} />
      </g>
    </svg>
  )
}
