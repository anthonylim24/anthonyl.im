import { Link } from 'react-router-dom'
import { Award, Repeat2, TrendingUp } from 'lucide-react'
import type { MoodValue } from '@/lib/mood'
import { formatDuration } from './format'
import { getBadge } from '../gamify/badges'
import type { SessionInsight } from '../gamify/insights'
import { isAdvancedProtocol } from '../protocols/catalog'
import type { BreathingProtocol } from '../protocols/types'
import type { CompletionResult } from '../session/completeSession'
import { MoodPicker } from './MoodPicker'
import { btnPrimary, btnSecondary } from './buttonStyles'

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
    <div className="min-w-0">
      <dt className="text-xs text-bw-tertiary">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-bw">{value}</dd>
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
    <div className="mx-auto w-full max-w-md">
      <p className="text-sm text-bw-secondary">Session complete</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-bw">{protocol.name}</h2>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="Duration" value={formatDuration(session.durationSeconds)} />
        <Stat label="Rounds" value={String(session.rounds)} />
        <Stat label="XP earned" value={`+${result.xpEarned}`} />
        {hasHolds && <Stat label="Longest hold" value={`${session.maxHoldTime}s`} />}
        {hasHolds && <Stat label="Average hold" value={`${session.avgHoldTime}s`} />}
        {result.streak > 1 && <Stat label="Streak" value={`${result.streak} days`} />}
      </dl>

      {result.isPersonalBest && (
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-bw-accent">
          <TrendingUp size={16} strokeWidth={1.75} aria-hidden="true" />
          New personal best hold
        </p>
      )}

      {newBadges.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="New badges">
          {newBadges.map((badge) => (
            <li key={badge.id} className="flex items-center gap-3 rounded-2xl bg-bw-accent-subtle p-3">
              <Award size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-bw-accent" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-bw">{badge.name}</p>
                <p className="truncate text-xs text-bw-secondary">{badge.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-bw-border pt-4">
        <p className="text-xs font-medium text-bw-secondary">
          {insight.label} session. {insight.doseLabel} dose.
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-bw">{insight.effect}</p>
        <p className="mt-2 text-sm leading-relaxed text-bw-secondary">{insight.nextStep}</p>
      </div>

      <div className="mt-6">
        <MoodPicker label="How do you feel now?" value={moodAfter} onChange={onMoodAfter} />
      </div>

      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <Link to="/breathwork/progress" className={`${btnPrimary} flex-1`}>
          Continue
        </Link>
        {!advanced && (
          <button type="button" className={`${btnSecondary} flex-1`} onClick={onRepeat}>
            <Repeat2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Repeat
          </button>
        )}
      </div>
      {advanced && (
        <p className="mt-3 text-center text-xs leading-relaxed text-bw-secondary">
          Take at least 90 seconds of easy breathing before another intense session.
        </p>
      )}
    </div>
  )
}
