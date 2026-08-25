import { Link } from 'react-router-dom'
import { sx } from '@/styles/merge'
import type { MoodValue } from '@/lib/mood'
import { formatDuration } from './format'
import { getBadge } from '../gamify/badges'
import type { SessionInsight } from '../gamify/insights'
import { isAdvancedProtocol } from '../protocols/catalog'
import type { BreathingProtocol } from '../protocols/types'
import type { CompletionResult } from '../session/completeSession'
import { bf } from '../styles/breathflow.stylex'
import { MoodPicker } from './MoodPicker'
import { btn } from './buttonStyles.stylex'

interface SessionSummaryProps {
  protocol: BreathingProtocol
  result: CompletionResult
  insight: SessionInsight
  moodAfter: MoodValue | undefined
  onMoodAfter: (value: MoodValue | undefined) => void
  onRepeat: () => void
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div {...sx(bf.minW0)}>
      <dt {...sx(bf.textXs, bf.textTertiary)}>{label}</dt>
      <dd {...sx(bf.mt05, bf.textLg, bf.fontSemibold, bf.tabularNums, bf.trackingTight, bf.textBw)}>{value}</dd>
    </div>
  )
}

/**
 * Post-session summary: protocol, duration, rounds, hold stats, XP, badges,
 * personal-best flag, insight, and the optional after-mood. Repeat is only
 * offered for non-safety-gated protocols; advanced summaries point to
 * recovery instead.
 */
export function SessionSummary({
  protocol,
  result,
  insight,
  moodAfter,
  onMoodAfter,
  onRepeat,
}: SessionSummaryProps) {
  const advanced = isAdvancedProtocol(protocol)
  const { session } = result
  const hasHolds = session.maxHoldTime > 0
  const newBadges = result.newBadgeIds
    .map(getBadge)
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))

  return (
    <div {...sx(bf.mxAuto, bf.wFull, bf.maxWMd)}>
      <p {...sx(bf.textSm, bf.textSecondary)}>Session complete</p>
      <h2 {...sx('bf-display', bf.mt1, bf.text2xl, bf.trackingTight, bf.textBw)}>{protocol.name}</h2>

      <dl {...sx(bf.statGrid)}>
        <Stat label="Duration" value={formatDuration(session.durationSeconds)} />
        <Stat label="Rounds" value={String(session.rounds)} />
        <Stat label="XP earned" value={`+${result.xpEarned}`} />
        {hasHolds && <Stat label="Longest hold" value={`${session.maxHoldTime}s`} />}
        {hasHolds && <Stat label="Average hold" value={`${session.avgHoldTime}s`} />}
        {result.streak > 1 && <Stat label="Streak" value={`${result.streak} days`} />}
      </dl>

      {result.isPersonalBest && (
        <p {...sx(bf.mt4, bf.textSm, bf.fontMedium, bf.textAccent)}>
          New personal best hold
        </p>
      )}

      {newBadges.length > 0 && (
        <ul {...sx(bf.mt4, bf.spaceY2)} aria-label="New badges">
          {newBadges.map((badge) => (
            <li key={badge.id} {...sx(bf.badgeItem)}>
              <p {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{badge.name}</p>
              <p {...sx(bf.truncate, bf.textXs, bf.textSecondary)}>{badge.description}</p>
            </li>
          ))}
        </ul>
      )}

      <div {...sx(bf.insightBlock)}>
        <p {...sx(bf.textXs, bf.fontMedium, bf.textSecondary)}>
          {insight.label} session. {insight.doseLabel} dose.
        </p>
        <p {...sx(bf.mt15, bf.textSm, bf.leadingRelaxed, bf.textBw)}>{insight.effect}</p>
        <p {...sx(bf.mt2, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>{insight.nextStep}</p>
      </div>

      <div {...sx(bf.mt6)}>
        <MoodPicker label="How do you feel now?" value={moodAfter} onChange={onMoodAfter} />
      </div>

      <div {...sx(bf.mt7, bf.actionRow)}>
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
