import { memo, useId, useMemo, type CSSProperties } from 'react'

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
  ink: 'var(--bw-text)',
  inkSecondary: 'var(--bw-text-secondary)',
} as const

export const BreathAura = memo(function BreathAura({
  size = 100,
  amplitude = 0,
  style,
  className,
}: BreathAuraProps) {
  const gradientId = useId().replace(/:/g, '')
  const clamped = Math.max(0, Math.min(1, amplitude))
  const coreScale = 0.82 + clamped * 0.28
  const ringOpacity = 0.28 + clamped * 0.24
  const petalOpacity = 0.16 + clamped * 0.22
  const rayLength = 27 + clamped * 9

  const rays = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30
        return {
          id: index,
          angle,
          x1: 100 + Math.cos((angle * Math.PI) / 180) * 46,
          y1: 100 + Math.sin((angle * Math.PI) / 180) * 46,
          x2: 100 + Math.cos((angle * Math.PI) / 180) * rayLength,
          y2: 100 + Math.sin((angle * Math.PI) / 180) * rayLength,
        }
      }),
    [rayLength]
  )

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
          <radialGradient id={`${gradientId}-core`} cx="42%" cy="36%" r="64%">
            <stop offset="0" stopColor={auraColors.surface} stopOpacity="0.7" />
            <stop offset="0.46" stopColor={auraColors.accentLight} stopOpacity="0.42" />
            <stop offset="1" stopColor={auraColors.accent} stopOpacity="0.82" />
          </radialGradient>
          <linearGradient id={`${gradientId}-ray`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={auraColors.accentLight} stopOpacity="0" />
            <stop offset="0.5" stopColor={auraColors.accent} stopOpacity="0.42" />
            <stop offset="1" stopColor={auraColors.inkSecondary} stopOpacity="0.18" />
          </linearGradient>
        </defs>

        <circle cx="100" cy="100" r="76" fill={auraColors.accentLight} opacity="0.08" />
        <circle cx="100" cy="100" r="62" stroke={auraColors.accent} strokeOpacity={ringOpacity} strokeWidth="1.5" />
        <circle cx="100" cy="100" r="44" stroke={auraColors.inkSecondary} strokeOpacity="0.18" strokeWidth="1" />

        <g stroke={`url(#${gradientId}-ray)`} strokeLinecap="round" strokeWidth="2">
          {rays.map((ray) => (
            <line key={ray.id} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} />
          ))}
        </g>

        <g
          style={{
            transform: `translateZ(0) scale(${coreScale})`,
            transformOrigin: '100px 100px',
            transition: 'transform 800ms var(--spring-smooth)',
          }}
        >
          <path
            d="M100 42c29 0 55 23 55 55 0 34-24 61-55 61s-55-27-55-61c0-32 26-55 55-55Z"
            fill={`url(#${gradientId}-core)`}
          />
          <path
            d="M72 95c13-22 41-22 56 0M70 109c16 18 44 18 60 0"
            stroke={auraColors.ink}
            strokeOpacity="0.17"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <ellipse cx="82" cy="78" rx="18" ry="11" fill={auraColors.surface} opacity="0.38" />
        </g>

        <g opacity={petalOpacity}>
          <path d="M100 18c10 18 10 34 0 49-10-15-10-31 0-49Z" fill={auraColors.accent} />
          <path d="M182 100c-18 10-34 10-49 0 15-10 31-10 49 0Z" fill={auraColors.accent} />
          <path d="M100 182c-10-18-10-34 0-49 10 15 10 31 0 49Z" fill={auraColors.accent} />
          <path d="M18 100c18-10 34-10 49 0-15 10-31 10-49 0Z" fill={auraColors.accent} />
        </g>
      </svg>
    </div>
  )
})
