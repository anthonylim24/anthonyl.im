import { BADGES } from '../gamify/badges'

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
    <dl className="space-y-3">
      {visible.map((badge) => {
        const isEarned = earned.has(badge.id)
        return (
          <div key={badge.id} className={isEarned ? '' : 'opacity-50'}>
            <dt className="break-words text-sm font-medium text-bw [overflow-wrap:anywhere]">{badge.name}</dt>
            <dd className="mt-0.5 break-words text-xs leading-snug text-bw-secondary [overflow-wrap:anywhere]">
              {isEarned ? badge.description : `Locked: ${badge.description.toLowerCase()}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
