import { memo, useId, type CSSProperties } from 'react'

interface BreathAuraProps {
  size?: number
  amplitude?: number
  style?: CSSProperties
  className?: string
}

const auraColors = {
  surface: 'var(--bw-surface)',
  accent: 'var(--bw-accent)',
  accentLight: 'var(--bw-accent-light)',
} as const

export const BreathAura = memo(function BreathAura({
  size = 100,
  amplitude = 0,
  style,
  className,
}: BreathAuraProps) {
  const gradientId = useId().replace(/:/g, '')
  const clamped = Math.max(0, Math.min(1, amplitude))
  const coreScale = 0.86 + clamped * 0.18
  const rimOpacity = 0.32 + clamped * 0.28
  const moteOpacity = 0.22 + clamped * 0.2

  return (
    <div
      style={{ ...style, width: size, height: size }}
      className={`aura-float${className ? ` ${className}` : ''}`}
      data-testid="breath-aura"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        fill="none"
      >
        <defs>
          <radialGradient id={`${gradientId}-core`} cx="38%" cy="32%" r="68%">
            <stop offset="0" stopColor={auraColors.surface} stopOpacity="0.78" />
            <stop offset="0.42" stopColor={auraColors.accentLight} stopOpacity="0.48" />
            <stop offset="1" stopColor={auraColors.accent} stopOpacity="0.88" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="78" fill={auraColors.accentLight} opacity="0.08" />
        <circle
          cx="100"
          cy="100"
          r="62"
          stroke={auraColors.accent}
          strokeOpacity={rimOpacity}
          strokeWidth="1.4"
        />
        <g
          style={{
            transform: `translateZ(0) scale(${coreScale})`,
            transformOrigin: '100px 100px',
            transition: 'transform 800ms var(--spring-smooth)',
          }}
        >
          <circle cx="100" cy="100" r="46" fill={`url(#${gradientId}-core)`} />
          <ellipse cx="82" cy="78" rx="16" ry="10" fill={auraColors.surface} opacity="0.42" />
        </g>
        <g opacity={moteOpacity} fill={auraColors.accentLight}>
          <circle cx="148" cy="64" r="3.2" />
          <circle cx="58" cy="142" r="2.4" />
          <circle cx="156" cy="128" r="1.8" />
        </g>
      </svg>
    </div>
  )
})
