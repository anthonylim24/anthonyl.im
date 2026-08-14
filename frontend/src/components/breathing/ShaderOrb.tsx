import { useRef, useMemo } from 'react'
import type { BreathPhase, TechniqueId } from '@/lib/constants'
import { getTechniqueRingColor } from '@/lib/techniqueConfig'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useWebGL2 } from '@/hooks/useWebGL2'
import { useWebGLOrb } from '@/hooks/useWebGLOrb'
import { ConcentricRings } from './ConcentricRings'
import { OrbParticleField } from './OrbParticleField'
import {
  getBreathingVisualizationLabel,
  getInteractiveBreathingVisualizationLabel,
} from './visualizationLabels'
import { cn } from '@/lib/utils'

interface ShaderOrbProps {
  phase: BreathPhase | null
  amplitude: number
  isActive: boolean
  techniqueId: TechniqueId
  themeColors?: [string, string]
  className?: string
  onClick?: () => void
}

/** Convert "#RRGGBB" hex to [r, g, b] in 0–1 range */
function hexToVec3(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export function ShaderOrb({
  phase,
  amplitude,
  isActive,
  techniqueId,
  themeColors,
  className,
  onClick,
}: ShaderOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()
  const webgl2 = useWebGL2()

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const ringColors = themeColors
    ? { primary: themeColors[0], secondary: themeColors[1] }
    : getTechniqueRingColor(techniqueId, isDark)

  const color1 = useMemo(() => hexToVec3(ringColors.primary), [ringColors.primary])
  const color2 = useMemo(() => hexToVec3(ringColors.secondary), [ringColors.secondary])

  const glFailed = useWebGLOrb({
    canvasRef,
    amplitude,
    color1,
    color2,
    isActive: isActive && !reducedMotion,
    reducedMotion,
    dark: isDark,
  })

  const ariaLabel = getBreathingVisualizationLabel(phase)
  const interactiveAriaLabel = getInteractiveBreathingVisualizationLabel(phase)

  if (reducedMotion) {
    const visual = (
      <div
        role={onClick ? undefined : 'img'}
        aria-hidden={onClick ? true : undefined}
        aria-label={onClick ? undefined : ariaLabel}
        className={cn('rounded-full', onClick ? 'h-full w-full' : className)}
        style={{ background: ringColors.primary, opacity: 0.3 }}
        data-testid={onClick ? undefined : 'concentric-rings'}
      />
    )

    if (onClick) {
      return (
        <button
          type="button"
          aria-label={interactiveAriaLabel}
          className={cn(
            'flex appearance-none items-center justify-center border-0 bg-transparent p-0',
            className,
          )}
          onClick={onClick}
          data-testid="concentric-rings"
          style={{ touchAction: 'manipulation' }}
        >
          {visual}
        </button>
      )
    }

    return visual
  }

  if (!webgl2 || glFailed) {
    return (
      <ConcentricRings
        phase={phase}
        amplitude={amplitude}
        isActive={isActive}
        techniqueId={techniqueId}
        themeColors={themeColors}
        className={className}
        onClick={onClick}
      />
    )
  }

  const orbCanvas = (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        data-testid="shader-orb-canvas"
        style={{ pointerEvents: 'none' }}
      />
      <OrbParticleField amplitude={amplitude} isActive={isActive} />
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={interactiveAriaLabel}
        className={cn(
          'relative flex appearance-none items-center justify-center border-0 bg-transparent p-0',
          className,
        )}
        onClick={onClick}
        data-testid="concentric-rings"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="relative h-full w-full">{orbCanvas}</div>
      </button>
    )
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('relative h-full w-full', className)}
      data-testid="concentric-rings"
      style={{ touchAction: 'manipulation' }}
    >
      {orbCanvas}
    </div>
  )
}
