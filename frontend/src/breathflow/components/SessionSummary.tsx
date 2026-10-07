import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { sx, stylex } from '@/styles/merge'
import type { MoodValue } from '@/lib/mood'
import { formatDuration } from './format'
import { getBadge } from '../gamify/badges'
import type { SessionInsight } from '../gamify/insights'
import { EASE_SETTLE } from '../motion/tokens'
import type { Pigment } from '../pigments'
import { useReducedMotion } from '../platform/useReducedMotion'
import { isAdvancedProtocol } from '../protocols/catalog'
import type { BreathingProtocol } from '../protocols/types'
import type { CompletionResult } from '../session/completeSession'
import { bf } from '../styles/breathflow.stylex'
import { wc } from '../styles/watercolor.stylex'
import { WaxSeal } from './BadgeGrid'
import { MoodPicker } from './MoodPicker'
import { btn } from './buttonStyles.stylex'

const styles = stylex.create({
  root: {
    position: 'relative',
    zIndex: 1,
    marginInline: 'auto',
    width: '100%',
    maxWidth: '32rem',
    paddingTop: '4.5rem',
    textAlign: 'center',
  },
  title: {
    marginTop: '0.4rem',
    fontSize: 'clamp(2.4rem, 7vw, 3.4rem)',
    lineHeight: 1.02,
    letterSpacing: '-0.025em',
    color: 'var(--bw-text)',
    textShadow: '0 0 24px var(--bw-canvas), 0 0 8px var(--bw-canvas)',
  },
  // The splash paints behind the heading; lift the small caps off it.
  eyebrow: {
    textShadow: '0 0 10px var(--bw-canvas), 0 0 4px var(--bw-canvas)',
    color: 'var(--bw-text-secondary)',
  },
  stats: {
    marginTop: '2rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    rowGap: '1.25rem',
    columnGap: '0.75rem',
    paddingBlock: '1.25rem',
    paddingInline: '1rem',
    borderRadius: '1.5rem',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 80%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle), 0 24px 60px -36px rgba(39, 35, 31, 0.35)',
  },
  statValue: {
    marginTop: '0.15rem',
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
    fontSize: '1.65rem',
    lineHeight: 1.1,
    fontVariantNumeric: 'lining-nums tabular-nums',
    color: 'var(--bw-text)',
  },
  statXp: {
    color: 'color-mix(in oklab, var(--bf-mass), var(--bw-text) 30%)',
  },
  pb: {
    marginTop: '1rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '0.9rem',
    minHeight: '2.25rem',
    borderRadius: '999px',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--bw-text)',
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 16%, transparent)',
  },
  badges: {
    marginTop: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    textAlign: 'left',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    paddingBlock: '0.65rem',
    paddingInline: '0.9rem',
    borderRadius: '1.1rem',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 80%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle)',
  },
  insight: {
    marginTop: '1.75rem',
    textAlign: 'left',
  },
  mood: {
    marginTop: '1.75rem',
    textAlign: 'left',
  },
  actions: {
    marginTop: '1.75rem',
    display: 'flex',
    gap: '0.6rem',
  },
})

interface SessionSummaryProps {
  protocol: BreathingProtocol
  result: CompletionResult
  insight: SessionInsight
  pigment: Pigment
  moodAfter: MoodValue | undefined
  onMoodAfter: (value: MoodValue | undefined) => void
  onRepeat: () => void
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div {...sx(bf.minW0)}>
      <dt {...sx(bf.textXs, bf.textTertiary)}>{label}</dt>
      <dd {...sx(styles.statValue, accent && styles.statXp)}>{value}</dd>
    </div>
  )
}

/**
 * Post-session summary: protocol, duration, rounds, hold stats, XP, badges
 * (pressed as wax seals), personal-best flag, insight, and the optional
 * after-mood. Repeat is only offered for non-safety-gated protocols;
 * advanced summaries point to recovery instead.
 */
export function SessionSummary({
  protocol,
  result,
  insight,
  pigment,
  moodAfter,
  onMoodAfter,
  onRepeat,
}: SessionSummaryProps) {
  const reducedMotion = useReducedMotion()
  const advanced = isAdvancedProtocol(protocol)
  const { session } = result
  const hasHolds = session.maxHoldTime > 0
  const newBadges = result.newBadgeIds
    .map(getBadge)
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))
  const vars = { '--bf-ink': pigment.mass, '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties
  const rise = (delay: number) => reducedMotion
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: EASE_SETTLE, delay } }

  return (
    <div {...sx(styles.root)} style={vars}>
      <motion.p {...rise(0.15)} {...sx(wc.eyebrow, styles.eyebrow)}>Session complete</motion.p>
      <motion.h2 {...rise(0.22)} {...sx('bf-display', styles.title)}>{protocol.name}</motion.h2>

      <motion.dl {...rise(0.32)} {...sx(styles.stats)}>
        <Stat label="Duration" value={formatDuration(session.durationSeconds)} />
        <Stat label="Rounds" value={String(session.rounds)} />
        <Stat label="XP earned" value={`+${result.xpEarned}`} accent />
        {hasHolds && <Stat label="Longest hold" value={`${session.maxHoldTime}s`} />}
        {hasHolds && <Stat label="Average hold" value={`${session.avgHoldTime}s`} />}
        {result.streak > 1 && <Stat label="Streak" value={`${result.streak} days`} />}
      </motion.dl>

      {result.isPersonalBest && (
        <motion.p {...rise(0.42)} {...sx(styles.pb)}>
          New personal best hold
        </motion.p>
      )}

      {newBadges.length > 0 && (
        <ul {...sx(styles.badges)} aria-label="New badges">
          {newBadges.map((badge, index) => (
            <motion.li
              key={badge.id}
              {...sx(styles.badge)}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.5 + index * 0.12 }}
            >
              <WaxSeal id={badge.id} name={badge.name} earned />
              <div {...sx(bf.minW0)}>
                <p {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{badge.name}</p>
                <p {...sx(bf.truncate, bf.textXs, bf.textSecondary)}>{badge.description}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <motion.div {...rise(0.48)} {...sx(styles.insight)}>
        <p {...sx(bf.textXs, bf.fontMedium, bf.textSecondary)}>
          {insight.label} session. {insight.doseLabel} dose.
        </p>
        <p {...sx(bf.mt15, bf.textSm, bf.leadingRelaxed, bf.textBw)}>{insight.effect}</p>
        <p {...sx(bf.mt2, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>{insight.nextStep}</p>
      </motion.div>

      <div {...sx(styles.mood)}>
        <MoodPicker label="How do you feel now?" value={moodAfter} onChange={onMoodAfter} />
      </div>

      <div {...sx(styles.actions)}>
        <Link to="/breathwork/progress" {...sx(btn.base, btn.primary, btn.flex1)}>
          Continue
        </Link>
        {!advanced && (
          <button type="button" {...sx(btn.base, btn.secondary, btn.flex1)} onClick={onRepeat}>
            Repeat
          </button>
        )}
      </div>
      {advanced && (
        <p {...sx(bf.mt3, bf.textCenter, bf.textXs, bf.leadingRelaxed, bf.textSecondary)}>
          Take at least 90 seconds of easy breathing before another intense session.
        </p>
      )}
    </div>
  )
}
