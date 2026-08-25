import { BADGES } from '../gamify/badges'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'

interface BadgeGridProps {
  earnedBadgeIds: readonly string[]
}

/**
 * Badge list. Secret badges are hidden entirely until earned; they should
 * be discovered, not previewed.
 */
export function BadgeGrid({ earnedBadgeIds }: BadgeGridProps) {
  const earned = new Set(earnedBadgeIds)
  const visible = BADGES.filter((badge) => !badge.secret || earned.has(badge.id))

  return (
    <dl {...sx(bf.spaceY3)}>
      {visible.map((badge) => {
        const isEarned = earned.has(badge.id)
        return (
          <div key={badge.id} {...sx(!isEarned && bf.opacity50)}>
            <dt {...sx(bf.breakWords, bf.textSm, bf.fontMedium, bf.textBw)}>{badge.name}</dt>
            <dd {...sx(bf.mt05, bf.breakWords, bf.textXs, bf.leadingSnug, bf.textSecondary)}>
              {isEarned ? badge.description : `Locked: ${badge.description.toLowerCase()}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
