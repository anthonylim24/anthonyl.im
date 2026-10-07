import type { CSSProperties } from 'react'
import { sx } from '@/styles/merge'
import { getLevelProgress } from '../gamify/levels'
import { bf } from '../styles/breathflow.stylex'
import { pg } from '../styles/progress.stylex'
import { wc } from '../styles/watercolor.stylex'

interface LevelRingProps {
  xp: number
}

const RING = 'M100 12 A88 88 0 1 1 99.99 12'

/** Current level inside a brushed ring that fills with XP toward the next. */
export function LevelRing({ xp }: LevelRingProps) {
  const progress = getLevelProgress(xp)
  const fraction = progress.xpForNextLevel > 0 ? progress.xpIntoLevel / progress.xpForNextLevel : 1
  const offset = 1 - Math.min(1, Math.max(0, fraction))

  return (
    <div {...sx(pg.level)}>
      <div {...sx(pg.ring)}>
        <svg viewBox="0 0 200 200" aria-hidden="true" {...sx(wc.strokeSvg)}>
          <circle cx="100" cy="100" r="88" {...sx(wc.strokeGuide)} />
          {/* bf-ring-fill (watercolor.css) paints in from empty; reduced motion skips it. */}
          <path
            d={RING}
            pathLength={1}
            {...sx('bf-brush bf-ring-fill', wc.strokePaint)}
            style={{ strokeWidth: 7, strokeDashoffset: offset } as CSSProperties}
          />
        </svg>
        <p {...sx('bf-display', pg.ringNumber)}>{progress.level}</p>
      </div>
      <div {...sx(bf.minW0)}>
        <p {...sx('bf-display', wc.italic, pg.levelTitle)}>{progress.title}</p>
        <p {...sx(pg.levelXp)}>
          {progress.xpForNextLevel > 0
            ? `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP into the next level`
            : 'Top level reached'}
        </p>
      </div>
    </div>
  )
}
