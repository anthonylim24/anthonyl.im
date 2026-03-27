import { ACCENT_WARM, ACCENT_WARM_LIGHT } from '@/lib/palette'

interface LevelRingProps {
  level: number
  progress: number // 0 to 1
  size?: number
  strokeWidth?: number
  colors?: [string, string]
}

const GLASS_BORDER = 'var(--bw-border)'

export function LevelRing({
  level,
  progress,
  size = 80,
  strokeWidth = 4,
  colors = [ACCENT_WARM, ACCENT_WARM_LIGHT],
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
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-sm font-normal text-bw">{level}</span>
      </div>
    </div>
  )
}
