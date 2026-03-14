import { useMemo, useRef, useCallback, type KeyboardEvent } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { KirbyCharacter } from './KirbyCharacter'

interface FluidOrbProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  themeColors?: [string, string]
  className?: string
  kirbyMode?: boolean
  onEasterEggToggle?: () => void
}

const PHASE_COLORS: Record<string, [string, string]> = {
  [BREATH_PHASES.INHALE]: ['#8B96FF', '#6E7BF2'],
  [BREATH_PHASES.DEEP_INHALE]: ['#99A5FF', '#8B96FF'],
  [BREATH_PHASES.HOLD_IN]: ['#B0B8FF', '#8B96FF'],
  [BREATH_PHASES.EXHALE]: ['#5B6AD4', '#4B55B8'],
  [BREATH_PHASES.HOLD_OUT]: ['#3D4A9E', '#2A3370'],
  [BREATH_PHASES.REST]: ['#2A3370', '#1E2550'],
  idle: ['#1E2550', '#2A3370'],
}

export function FluidOrb({
  phase,
  amplitude,
  isActive,
  themeColors,
  className,
  kirbyMode = false,
  onEasterEggToggle,
}: FluidOrbProps) {
  const reducedMotion = useReducedMotion()
  const colors = themeColors ?? PHASE_COLORS[phase ?? 'idle']
  const scale = reducedMotion ? 1 : 0.6 + amplitude * 0.4
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

  // Tap detection: 5 taps within 2 seconds triggers the easter egg toggle
  const tapTimestampsRef = useRef<number[]>([])
  const handleClick = useCallback(() => {
    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2000)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length >= 5) {
      tapTimestampsRef.current = []
      onEasterEggToggle?.()
    }
  }, [onEasterEggToggle])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  const transitionStyle = reducedMotion ? 'none' : undefined

  if (kirbyMode) {
    return (
      <div
        data-testid="fluid-orb"
        role="button"
        tabIndex={0}
        aria-label="Breathing orb"
        className={cn('relative flex items-center justify-center', className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            transform: `translateZ(0) scale(${scale})`,
            transition: transitionStyle ?? `transform ${transitionDuration} ease-out`,
          }}
        >
          <KirbyCharacter size={200} puffAmount={reducedMotion ? 0 : amplitude} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="fluid-orb"
      role="button"
      tabIndex={0}
      aria-label="Breathing orb"
      className={cn('relative flex items-center justify-center', className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Outer glow — use transform: scale instead of width/height to stay on GPU */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          width: '110%',
          height: '110%',
          maxWidth: '340px',
          maxHeight: '340px',
          transform: `translateZ(0) scale(${scale})`,
          background: `radial-gradient(circle, ${colors[0]}40, transparent 70%)`,
          opacity: isActive ? 0.8 : 0.3,
          transition: transitionStyle ?? `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
        }}
      />
      {/* Secondary glow */}
      <div
        className="absolute rounded-full blur-xl"
        style={{
          width: '90%',
          height: '90%',
          maxWidth: '280px',
          maxHeight: '280px',
          transform: `translateZ(0) scale(${scale})`,
          background: `radial-gradient(circle, ${colors[1]}30, transparent 60%)`,
          opacity: isActive ? 0.6 : 0.2,
          transition: transitionStyle ?? `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
        }}
      />
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
          boxShadow: `
            0 0 60px ${colors[0]}40,
            0 0 120px ${colors[0]}20,
            inset 0 -20px 40px ${colors[1]}40,
            inset 0 20px 40px rgba(255,255,255,0.15)
          `,
          transition: transitionStyle ?? `transform ${transitionDuration} ease-out, border-radius ${transitionDuration} ease-out`,
        }}
      >
        <div
          className="absolute top-[15%] left-[20%] rounded-full"
          style={{
            width: '40%',
            height: '25%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4), transparent)',
            filter: 'blur(8px)',
            transform: 'translateZ(0)',
          }}
        />
      </div>
    </div>
  )
}
