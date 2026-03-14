import { useMemo, useRef, useCallback } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { PHASE } from '@/lib/palette'
import { cn } from '@/lib/utils'
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

// Default phase colors (indigo) used when no technique-specific themeColors are passed
const PHASE_COLORS: Record<string, [string, string]> = {
  [BREATH_PHASES.INHALE]: [PHASE.inhale, PHASE.exhale],
  [BREATH_PHASES.DEEP_INHALE]: [PHASE.deep_inhale, PHASE.inhale],
  [BREATH_PHASES.HOLD_IN]: [PHASE.hold_in, PHASE.inhale],
  [BREATH_PHASES.EXHALE]: [PHASE.exhale, PHASE.hold_out],
  [BREATH_PHASES.HOLD_OUT]: [PHASE.hold_out, PHASE.rest],
  [BREATH_PHASES.REST]: [PHASE.rest, '#1E2550'],
  idle: ['#1E2550', PHASE.rest],
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
  const colors = themeColors ?? PHASE_COLORS[phase ?? 'idle']
  const scale = 0.6 + amplitude * 0.4
  const morphAmount = isActive ? amplitude * 15 : 0
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

  if (kirbyMode) {
    return (
      <div
        data-testid="fluid-orb"
        className={cn('relative flex items-center justify-center', className)}
        onClick={handleClick}
      >
        <div
          style={{
            transform: `translateZ(0) scale(${scale})`,
            transition: `transform ${transitionDuration} ease-out`,
            willChange: 'transform',
          }}
        >
          <KirbyCharacter size={200} puffAmount={amplitude} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="fluid-orb"
      className={cn('relative flex items-center justify-center', className)}
      onClick={handleClick}
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
          transition: `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
          willChange: 'transform, opacity',
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
          transition: `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
          willChange: 'transform, opacity',
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
          transition: `transform ${transitionDuration} ease-out, border-radius ${transitionDuration} ease-out`,
          willChange: 'transform, border-radius',
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
