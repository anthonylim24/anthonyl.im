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

  const transitionDuration = isActive ? '800ms' : '1200ms'

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
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
