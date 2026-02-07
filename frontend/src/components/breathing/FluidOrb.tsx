import { useMemo } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface FluidOrbProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  themeColors?: [string, string]
  className?: string
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

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Outer glow */}
      <div
        className="absolute rounded-full transition-all duration-700 blur-3xl"
        style={{
          width: `${scale * 110}%`,
          height: `${scale * 110}%`,
          maxWidth: '340px',
          maxHeight: '340px',
          background: `radial-gradient(circle, ${colors[0]}40, transparent 70%)`,
          opacity: isActive ? 0.8 : 0.3,
        }}
      />
      {/* Secondary glow */}
      <div
        className="absolute rounded-full transition-all duration-1000 blur-xl"
        style={{
          width: `${scale * 90}%`,
          height: `${scale * 90}%`,
          maxWidth: '280px',
          maxHeight: '280px',
          background: `radial-gradient(circle, ${colors[1]}30, transparent 60%)`,
          opacity: isActive ? 0.6 : 0.2,
        }}
      />
      {/* Main orb */}
      <div
        className="relative transition-all ease-out"
        style={{
          width: `${scale * 70}%`,
          height: `${scale * 70}%`,
          maxWidth: '220px',
          maxHeight: '220px',
          borderRadius,
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          boxShadow: `
            0 0 60px ${colors[0]}40,
            0 0 120px ${colors[0]}20,
            inset 0 -20px 40px ${colors[1]}40,
            inset 0 20px 40px rgba(255,255,255,0.15)
          `,
          transitionDuration: isActive ? '800ms' : '1200ms',
        }}
      >
        <div
          className="absolute top-[15%] left-[20%] rounded-full"
          style={{
            width: '40%',
            height: '25%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4), transparent)',
            filter: 'blur(8px)',
          }}
        />
      </div>
    </div>
  )
}
