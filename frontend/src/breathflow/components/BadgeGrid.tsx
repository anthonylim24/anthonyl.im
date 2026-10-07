import type { CSSProperties } from 'react'
import { BADGES } from '../gamify/badges'
import { TECHNIQUE_PIGMENTS } from '../pigments'
import { sx, stylex } from '@/styles/merge'

const SEAL_INKS = Object.values(TECHNIQUE_PIGMENTS).map((p) => p.mass)

/** Stable wax colour per badge. */
export function sealInk(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return SEAL_INKS[Math.abs(h) % SEAL_INKS.length]
}

const styles = stylex.create({
  grid: {
    display: 'grid',
    rowGap: '1.1rem',
    columnGap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    minWidth: 0,
  },
  seal: {
    position: 'relative',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    width: '2.9rem',
    height: '2.9rem',
    borderRadius: '47% 53% 44% 56% / 55% 43% 57% 45%',
    backgroundColor: 'var(--bf-wax)',
    backgroundImage:
      'radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.34), transparent 38%), radial-gradient(circle at 50% 55%, transparent 52%, rgba(0, 0, 0, 0.22) 70%, transparent 74%)',
    boxShadow: 'inset 0 -3px 6px rgba(0, 0, 0, 0.28), inset 0 2px 3px rgba(255, 255, 255, 0.25), 0 3px 8px -3px rgba(39, 35, 31, 0.45)',
    transform: 'rotate(var(--bf-tilt))',
  },
  sealSmall: {
    width: '2.4rem',
    height: '2.4rem',
  },
  monogram: {
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
    fontStyle: 'italic',
    fontVariationSettings: '"SOFT" 100, "WONK" 1',
    fontSize: '1.15rem',
    lineHeight: 1,
    color: 'rgba(255, 250, 240, 0.78)',
    textShadow: '0 -1px 0 rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.2)',
  },
  locked: {
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--bw-text) 18%, transparent)',
  },
  lockedMonogram: {
    color: 'color-mix(in srgb, var(--bw-text) 30%, transparent)',
    textShadow: 'none',
  },
  text: { minWidth: 0 },
  name: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--bw-text)',
    overflowWrap: 'anywhere',
  },
  nameLocked: {
    color: 'var(--bw-text-secondary)',
  },
  desc: {
    marginTop: '0.1rem',
    fontSize: '0.75rem',
    lineHeight: 1.4,
    color: 'var(--bw-text-secondary)',
    overflowWrap: 'anywhere',
  },
})

/** A pressed wax seal; unearned seals are a pencilled ring. */
export function WaxSeal({ id, name, earned, small = false }: { id: string; name: string; earned: boolean; small?: boolean }) {
  const tilt = ((id.length * 37) % 17) - 8
  const vars = { '--bf-wax': sealInk(id), '--bf-tilt': `${tilt}deg` } as CSSProperties
  return (
    <span aria-hidden="true" {...sx(styles.seal, small && styles.sealSmall, !earned && styles.locked)} style={vars}>
      <span {...sx(styles.monogram, !earned && styles.lockedMonogram)}>{name.charAt(0)}</span>
    </span>
  )
}

interface BadgeGridProps {
  earnedBadgeIds: readonly string[]
}

/**
 * Badges as wax seals. Secret badges are hidden entirely until earned; they
 * should be discovered, not previewed.
 */
export function BadgeGrid({ earnedBadgeIds }: BadgeGridProps) {
  const earned = new Set(earnedBadgeIds)
  const visible = BADGES.filter((badge) => !badge.secret || earned.has(badge.id))

  return (
    <ul {...sx(styles.grid)}>
      {visible.map((badge) => {
        const isEarned = earned.has(badge.id)
        return (
          <li key={badge.id} {...sx(styles.item)}>
            <WaxSeal id={badge.id} name={badge.name} earned={isEarned} />
            <div {...sx(styles.text)}>
              <p {...sx(styles.name, !isEarned && styles.nameLocked)}>{badge.name}</p>
              <p {...sx(styles.desc)}>
                {isEarned ? badge.description : `Locked: ${badge.description.toLowerCase()}`}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
