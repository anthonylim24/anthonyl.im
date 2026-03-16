import { ACHIEVEMENT, ACCENT_BRIGHT } from '@/lib/palette'

interface LevelRingProps {
  level: number
  progress: number // 0 to 1
  size?: number
  strokeWidth?: number
  colors?: [string, string]
}

const GLASS_BORDER = 'rgba(0, 0, 0, 0.08)'

export function LevelRing({
  level,
  progress,
  size = 80,
  strokeWidth = 4,
  colors = [ACHIEVEMENT, ACCENT_BRIGHT],
}: LevelRingProps) {
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)))
  const gradientId = `ring-grad-${level}-${size}`

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
          {/* Glow filter */}
          <filter id={`ring-glow-${level}-${size}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={GLASS_BORDER}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ transform: 'translateZ(0)' }}
          filter={progress > 0 ? `url(#ring-glow-${level}-${size})` : undefined}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-xl font-bold text-zinc-900">{level}</span>
      </div>
    </div>
  )
}
