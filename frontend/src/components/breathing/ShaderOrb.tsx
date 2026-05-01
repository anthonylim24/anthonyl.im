import { useCallback, useRef, useMemo, type KeyboardEvent } from 'react'
import type { BreathPhase, TechniqueId } from '@/lib/constants'
import { getTechniqueRingColor } from '@/lib/techniqueConfig'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useWebGL2 } from '@/hooks/useWebGL2'
import { useWebGLOrb } from '@/hooks/useWebGLOrb'
import { ConcentricRings } from './ConcentricRings'
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
  })

  const ariaLabel = phase
    ? `Breathing visualization: ${phase.replace('_', ' ')} phase`
    : 'Breathing visualization: ready'
  const interactiveAriaLabel = `${ariaLabel}. Activate repeatedly to toggle alternate visual.`
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }, [onClick])

  // Fallback: reduced-motion + inactive → static div; no WebGL2 or GL error → SVG ConcentricRings
  if (reducedMotion && !isActive) {
    return (
      <div
        role={onClick ? 'button' : 'img'}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? interactiveAriaLabel : ariaLabel}
        className={cn('rounded-full', className)}
        style={{ background: ringColors.primary, opacity: 0.3 }}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        data-testid="concentric-rings"
      />
    )
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

  return (
    <canvas
      ref={canvasRef}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? interactiveAriaLabel : ariaLabel}
      className={cn('w-full h-full', className)}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-testid="concentric-rings"
      style={{ touchAction: 'manipulation' }}
    />
  )
}
