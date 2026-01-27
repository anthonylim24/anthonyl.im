import { useMemo, useEffect, useState } from 'react'
import { useWaveform } from '@/hooks/useWaveform'
import type { BreathPhase } from '@/lib/constants'
import { BREATH_PHASES } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface WaveformVisualizerProps {
  phase: BreathPhase | null
  phaseDuration: number
  timeRemaining: number
  isActive: boolean
  className?: string
}

// Hoisted constant to avoid array recreation on every render
const PARTICLE_INDICES = [0, 1, 2, 3, 4, 5];

export function WaveformVisualizer({
  phase,
  phaseDuration,
  timeRemaining,
  isActive,
  className = '',
}: WaveformVisualizerProps) {
  const { amplitude } = useWaveform({
    phase,
    phaseDuration,
    timeRemaining,
    isActive,
  })

  const [time, setTime] = useState(0)

  // Animate wave movement
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      setTime((t) => t + 0.05)
    }, 50)

    return () => clearInterval(interval)
  }, [isActive])

  const phaseColors = useMemo(() => {
    switch (phase) {
      case BREATH_PHASES.INHALE:
        return {
          primary: 'hsl(210 100% 60%)',
          secondary: 'hsl(210 100% 70%)',
          glow: 'hsl(210 100% 60% / 0.4)',
          gradient: ['hsl(210 100% 60%)', 'hsl(230 100% 70%)'],
        }
      case BREATH_PHASES.HOLD_IN:
        return {
          primary: 'hsl(270 80% 65%)',
          secondary: 'hsl(270 80% 75%)',
          glow: 'hsl(270 80% 65% / 0.4)',
          gradient: ['hsl(270 80% 65%)', 'hsl(290 80% 70%)'],
        }
      case BREATH_PHASES.EXHALE:
        return {
          primary: 'hsl(175 70% 45%)',
          secondary: 'hsl(175 70% 55%)',
          glow: 'hsl(175 70% 50% / 0.4)',
          gradient: ['hsl(175 70% 45%)', 'hsl(160 70% 50%)'],
        }
      case BREATH_PHASES.HOLD_OUT:
        return {
          primary: 'hsl(40 90% 55%)',
          secondary: 'hsl(40 90% 65%)',
          glow: 'hsl(40 90% 55% / 0.4)',
          gradient: ['hsl(40 90% 55%)', 'hsl(30 90% 60%)'],
        }
      default:
        return {
          primary: 'hsl(220 15% 50%)',
          secondary: 'hsl(220 15% 60%)',
          glow: 'hsl(220 15% 50% / 0.2)',
          gradient: ['hsl(220 15% 50%)', 'hsl(220 15% 60%)'],
        }
    }
  }, [phase])

  const width = 400
  const height = 300
  const centerY = height / 2
  const orbRadius = 60 + amplitude * 50

  // Generate flowing wave path
  const generateWavePath = (amp: number, offset: number = 0) => {
    const waveHeight = 40 * amp
    const points: string[] = []
    const segments = 100

    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * width
      const progress = i / segments
      const wave1 = Math.sin((progress * Math.PI * 3) + time + offset) * waveHeight
      const wave2 = Math.sin((progress * Math.PI * 2) + time * 0.7 + offset) * waveHeight * 0.5
      const y = centerY - (wave1 + wave2)
      points.push(i === 0 ? `M ${x},${y}` : `L ${x},${y}`)
    }

    return points.join(' ')
  }

  // Generate filled area under wave
  const generateFilledPath = (amp: number, offset: number = 0) => {
    const waveHeight = 40 * amp
    const points: string[] = []
    const segments = 100

    points.push(`M 0,${height}`)

    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * width
      const progress = i / segments
      const wave1 = Math.sin((progress * Math.PI * 3) + time + offset) * waveHeight
      const wave2 = Math.sin((progress * Math.PI * 2) + time * 0.7 + offset) * waveHeight * 0.5
      const y = centerY - (wave1 + wave2)
      points.push(`L ${x},${y}`)
    }

    points.push(`L ${width},${height}`)
    points.push('Z')

    return points.join(' ')
  }

  return (
    <div className={cn('relative', className)}>
      {/* Background glow effect */}
      <div
        className="absolute inset-0 rounded-3xl transition-all duration-700 blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${phaseColors.glow}, transparent 70%)`,
          opacity: isActive ? 0.6 : 0.2,
        }}
      />

      {/* Glass container - wrap SVG in div for GPU-accelerated transforms */}
      <div className="relative glass-strong rounded-3xl overflow-hidden">
        {/* Animated wrapper div for hardware acceleration */}
        <div className="transform-gpu">
          <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Gradient definitions */}
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={phaseColors.gradient[0]} stopOpacity="0.6" />
              <stop offset="100%" stopColor={phaseColors.gradient[1]} stopOpacity="0.1" />
            </linearGradient>

            <linearGradient id="orbGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={phaseColors.secondary} stopOpacity="0.9" />
              <stop offset="50%" stopColor={phaseColors.primary} stopOpacity="0.7" />
              <stop offset="100%" stopColor={phaseColors.gradient[1]} stopOpacity="0.5" />
            </linearGradient>

            <radialGradient id="orbGlow" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="white" stopOpacity="0.4" />
              <stop offset="50%" stopColor={phaseColors.secondary} stopOpacity="0.2" />
              <stop offset="100%" stopColor={phaseColors.primary} stopOpacity="0" />
            </radialGradient>

            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="20" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Subtle grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-foreground/5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Background wave (subtle) */}
          <path
            d={generateFilledPath(amplitude * 0.5, 1)}
            fill="url(#waveGradient)"
            opacity="0.3"
          />

          {/* Main wave filled area */}
          <path
            d={generateFilledPath(amplitude, 0)}
            fill="url(#waveGradient)"
            className="transition-all duration-300"
          />

          {/* Wave line with glow */}
          <path
            d={generateWavePath(amplitude, 0)}
            fill="none"
            stroke={phaseColors.primary}
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#glow)"
            className="transition-all duration-300"
          />

          {/* Central breathing orb */}
          <g filter="url(#softGlow)">
            {/* Outer glow ring */}
            <circle
              cx={width / 2}
              cy={centerY}
              r={orbRadius + 20}
              fill="none"
              stroke={phaseColors.primary}
              strokeWidth="1"
              opacity={isActive ? 0.3 : 0.1}
              className="transition-all duration-500"
            />

            {/* Main orb */}
            <circle
              cx={width / 2}
              cy={centerY}
              r={orbRadius}
              fill="url(#orbGradient)"
              className="transition-all duration-500"
            />

            {/* Inner highlight */}
            <circle
              cx={width / 2}
              cy={centerY}
              r={orbRadius}
              fill="url(#orbGlow)"
            />

            {/* Specular highlight */}
            <ellipse
              cx={width / 2 - orbRadius * 0.25}
              cy={centerY - orbRadius * 0.3}
              rx={orbRadius * 0.3}
              ry={orbRadius * 0.2}
              fill="white"
              opacity="0.3"
            />
          </g>

          {/* Floating particles - using hoisted constant */}
          {isActive && PARTICLE_INDICES.map((i) => {
            const angle = (i / 6) * Math.PI * 2 + time * 0.3
            const particleRadius = orbRadius + 40 + Math.sin(time + i) * 10
            const px = width / 2 + Math.cos(angle) * particleRadius
            const py = centerY + Math.sin(angle) * particleRadius * 0.6
            return (
              <circle
                key={i}
                cx={px}
                cy={py}
                r={3 + Math.sin(time * 2 + i) * 1.5}
                fill={phaseColors.secondary}
                opacity={0.4 + Math.sin(time + i) * 0.2}
              />
            )
          })}
        </svg>
        </div>
      </div>
    </div>
  )
}
