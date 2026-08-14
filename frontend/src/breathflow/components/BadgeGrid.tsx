import { Award } from 'lucide-react'
import { BADGES } from '../gamify/badges'

interface BadgeGridProps {
  earnedBadgeIds: readonly string[]
}

/**
 * Badge grid. Secret badges are hidden entirely until earned; they should
 * be discovered, not previewed.
 */
export function BadgeGrid({ earnedBadgeIds }: BadgeGridProps) {
  const earned = new Set(earnedBadgeIds)
  const visible = BADGES.filter((badge) => !badge.secret || earned.has(badge.id))

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {visible.map((badge) => {
        const isEarned = earned.has(badge.id)
        return (
          <li
            key={badge.id}
            className={[
              'rounded-2xl border p-3 transition-colors duration-200',
              isEarned
                ? 'border-bw-accent/40 bg-bw-accent-subtle'
                : 'border-bw-border bg-bw-surface opacity-60',
            ].join(' ')}
          >
            <Award
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className={isEarned ? 'text-bw-accent' : 'text-bw-tertiary'}
            />
            <p className="mt-2 text-sm font-medium leading-snug text-bw">{badge.name}</p>
            <p className="mt-0.5 text-xs leading-snug text-bw-secondary">
              {isEarned ? badge.description : `Locked: ${badge.description.toLowerCase()}`}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
