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
            <dt className="text-sm font-medium text-bw">{badge.name}</dt>
            <dd className="mt-0.5 text-xs leading-snug text-bw-secondary">
              {isEarned ? badge.description : `Locked: ${badge.description.toLowerCase()}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
