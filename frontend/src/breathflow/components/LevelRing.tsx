import { getLevelProgress } from '../gamify/levels'

interface LevelRingProps {
  xp: number
}

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Level ring: current level, title, and XP into the next level. */
export function LevelRing({ xp }: LevelRingProps) {
  const progress = getLevelProgress(xp)
  const fraction = progress.xpForNextLevel > 0
    ? Math.min(1, progress.xpIntoLevel / progress.xpForNextLevel)
    : 1

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--bw-chart-grid)" strokeWidth={7} />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--bw-accent)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-bw">
            {progress.level}
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em] text-bw-tertiary">Level</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-tight text-bw">{progress.title}</p>
        <p className="mt-0.5 text-sm tabular-nums text-bw-secondary">
          {progress.xpForNextLevel > 0
            ? `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP into the next level`
            : 'Top level reached'}
        </p>
      </div>
    </div>
  )
}
