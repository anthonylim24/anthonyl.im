import { getLevelProgress } from '../gamify/levels'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'

interface LevelRingProps {
  xp: number
}

/** Current level, title, and XP into the next level. Type, not a meter. */
export function LevelRing({ xp }: LevelRingProps) {
  const progress = getLevelProgress(xp)

  return (
    <div {...sx(bf.flexItemsEndGap5)}>
      <p {...sx('bf-display', bf.text6xl, bf.leadingNone, bf.trackingTight, bf.textBw)}>
        {progress.level}
      </p>
      <div {...sx(bf.minW0, bf.pb1Only)}>
        <p {...sx(bf.breakWords, bf.textLg, bf.fontMedium, bf.trackingTight, bf.textBw)}>
          {progress.title}
        </p>
        <p {...sx(bf.mt05, bf.textSm, bf.tabularNums, bf.textSecondary)}>
          {progress.xpForNextLevel > 0
            ? `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP into the next level`
            : 'Top level reached'}
        </p>
      </div>
    </div>
  )
}
