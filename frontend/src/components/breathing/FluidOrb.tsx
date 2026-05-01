import { useMemo, useRef, useCallback } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { PHASE, INK_FAINT } from '@/lib/palette'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useHaptics } from '@/hooks/useHaptics'
import { BreathAura } from './BreathAura'

interface FluidOrbProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  themeColors?: [string, string]
  className?: string
  auraMode?: boolean
  onAuraModeToggle?: () => void
}

// Default phase colors (ink ramp) used when no technique-specific themeColors are passed
const PHASE_COLORS: Record<string, [string, string]> = {
  [BREATH_PHASES.INHALE]: [PHASE.inhale, PHASE.exhale],
  [BREATH_PHASES.DEEP_INHALE]: [PHASE.deep_inhale, PHASE.inhale],
  [BREATH_PHASES.HOLD_IN]: [PHASE.hold_in, PHASE.inhale],
  [BREATH_PHASES.EXHALE]: [PHASE.exhale, PHASE.hold_out],
  [BREATH_PHASES.HOLD_OUT]: [PHASE.hold_out, PHASE.rest],
  [BREATH_PHASES.REST]: [PHASE.rest, INK_FAINT],
  idle: [INK_FAINT, PHASE.rest],
}

export function FluidOrb({
  phase,
  amplitude,
  isActive,
  themeColors,
  className,
  auraMode = false,
  onAuraModeToggle,
}: FluidOrbProps) {
  const reducedMotion = useReducedMotion()
  const { trigger: haptic } = useHaptics()
  const colors = themeColors ?? PHASE_COLORS[phase ?? 'idle']
  const scale = reducedMotion ? 1 : 0.45 + amplitude * 0.65
  const morphAmount = isActive && !reducedMotion ? amplitude * 15 : 0
  const borderRadius = useMemo(() => {
    const base = 50
    const r1 = base + morphAmount
    const r2 = base - morphAmount * 0.5
    const r3 = base + morphAmount * 0.7
    const r4 = base - morphAmount * 0.3
    return `${r1}% ${r2}% ${r3}% ${r4}% / ${r2}% ${r3}% ${r4}% ${r1}%`
  }, [morphAmount])

  const transitionDuration = isActive ? '800ms' : '1200ms'

  // Tap detection: 5 taps within 2 seconds triggers aura mode.
  const tapTimestampsRef = useRef<number[]>([])
  const handleClick = useCallback(() => {
    haptic('selection')
    if (reducedMotion) return

    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2000)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length >= 5) {
      tapTimestampsRef.current = []
      haptic('success')
      onAuraModeToggle?.()
    }
  }, [onAuraModeToggle, haptic, reducedMotion])

  const transitionStyle = reducedMotion ? 'none' : undefined
  const phaseLabel = phase ? phase.replace('_', ' ') : 'idle'

  if (auraMode) {
    return (
      <button
        type="button"
        data-testid="fluid-orb"
        aria-label={`Breathing orb — ${phaseLabel}`}
        className={cn(
          'relative flex appearance-none items-center justify-center border-0 bg-transparent p-0',
          className,
        )}
        onClick={handleClick}
        style={{ touchAction: 'manipulation' }}
      >
        <div
          style={{
            transform: `translateZ(0) scale(${scale})`,
            transition: transitionStyle ?? `transform ${transitionDuration} ease-out`,
          }}
        >
          <BreathAura size={200} amplitude={reducedMotion ? 0 : amplitude} />
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      data-testid="fluid-orb"
      aria-label={`Breathing orb — ${phaseLabel}`}
      className={cn(
        'relative flex appearance-none items-center justify-center border-0 bg-transparent p-0',
        className,
      )}
      onClick={handleClick}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Main orb */}
      <div
        className="relative"
        style={{
          width: '70%',
          height: '70%',
          maxWidth: '220px',
          maxHeight: '220px',
          transform: `translateZ(0) scale(${scale})`,
          borderRadius,
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          transition: transitionStyle ?? `transform ${transitionDuration} ease-out, border-radius ${transitionDuration} ease-out`,
        }}
      />
    </button>
  )
}
