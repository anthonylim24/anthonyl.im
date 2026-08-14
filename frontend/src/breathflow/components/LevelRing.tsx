import { getLevelProgress } from '../gamify/levels'

interface LevelRingProps {
  xp: number
}

/** Current level, title, and XP into the next level. Type, not a meter. */
export function LevelRing({ xp }: LevelRingProps) {
  const progress = getLevelProgress(xp)

  return (
    <div className="flex items-end gap-5">
      <p className="bf-display text-6xl leading-none tracking-tight text-bw">
        {progress.level}
      </p>
      <div className="min-w-0 pb-1">
        <p className="text-lg font-medium tracking-tight text-bw">{progress.title}</p>
        <p className="mt-0.5 text-sm tabular-nums text-bw-secondary">
          {progress.xpForNextLevel > 0
            ? `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP into the next level`
            : 'Top level reached'}
        </p>
      </div>
    </div>
  )
}
