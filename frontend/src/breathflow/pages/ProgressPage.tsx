import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAverageMoodShift } from '@/lib/mood'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { BadgeGrid } from '../components/BadgeGrid'
import { HistoryList } from '../components/HistoryList'
import { HoldChart } from '../components/HoldChart'
import { LevelRing } from '../components/LevelRing'
import { btnDestructive, btnPrimary, btnSecondary } from '../components/buttonStyles'
import { getWeekSummary } from '../gamify/practiceWeek'
import { getProtocol, PROTOCOLS } from '../protocols/catalog'
import { buildSessionPath } from '../session/urlParams'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-bw-border pt-5">
      <h2 className="text-sm font-semibold text-bw">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function ProgressPage() {
  const sessions = useHistoryStore((state) => state.sessions)
  const personalBests = useHistoryStore((state) => state.personalBests)
  const clearHistory = useHistoryStore((state) => state.clearHistory)
  const xp = useGamificationStore((state) => state.xp)
  const earnedBadges = useGamificationStore((state) => state.earnedBadges)

  const [confirmingClear, setConfirmingClear] = useState(false)

  const week = useMemo(() => getWeekSummary(sessions), [sessions])
  const moodTrend = useMemo(() => getAverageMoodShift(sessions), [sessions])
  const hasHoldSessions = sessions.some((session) => session.maxHoldTime > 0)
  const bests = PROTOCOLS
    .map((protocol) => ({ protocol, best: personalBests[protocol.id] }))
    .filter((entry) => entry.best && entry.best.maxHoldTime > 0)

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-bw">Progress</h1>
        <p className="text-sm text-bw-secondary">No sessions yet.</p>
        <p className="max-w-sm text-sm leading-relaxed text-bw-secondary">
          Complete your first session and your practice, streaks, and holds
          will build up here.
        </p>
        <Link
          to={buildSessionPath({ techniqueId: 'box_breathing', rounds: getProtocol('box_breathing').defaultRounds })}
          className={btnPrimary}
        >
          Start Box Breathing
        </Link>
      </div>
    )
  }

  const weekTopProtocol = week.topTechniqueId ? getProtocol(week.topTechniqueId) : null

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-bw">Progress</h1>

        {/* This week: sentence-first, not a stat-card wall. */}
        <p className="mt-4 max-w-lg text-lg leading-relaxed tracking-tight text-bw">
          {week.activeDays === 0
            ? 'Nothing logged in the last seven days.'
            : `${week.activeDays} active ${week.activeDays === 1 ? 'day' : 'days'} this week: ${week.minutes} ${week.minutes === 1 ? 'minute' : 'minutes'} across ${week.sessionCount} ${week.sessionCount === 1 ? 'session' : 'sessions'}${weekTopProtocol ? `, mostly ${weekTopProtocol.name}` : ''}.`}
        </p>
        <p className="mt-2 text-sm text-bw-secondary">
          {week.nextStep}
          {week.performanceNote ? ` ${week.performanceNote}` : ''}
        </p>
      </div>

      {moodTrend && (
        <Section title="Calm shift">
          <p className="text-sm leading-relaxed text-bw-secondary">
            Across {moodTrend.count} rated {moodTrend.count === 1 ? 'session' : 'sessions'}, your calm
            moved {moodTrend.averageShift >= 0 ? 'up' : 'down'} an average of{' '}
            <span className="font-medium tabular-nums text-bw">{Math.abs(moodTrend.averageShift)}</span>{' '}
            points, and {Math.round(moodTrend.positiveRate * 100)}% ended calmer than they began.
          </p>
        </Section>
      )}

      {hasHoldSessions && (
        <Section title="Hold time">
          <HoldChart sessions={sessions} />
        </Section>
      )}

      <Section title="Level">
        <LevelRing xp={xp} />
      </Section>

      <Section title="Activity">
        <ActivityHeatmap sessions={sessions} />
      </Section>

      <Section title="Badges">
        <BadgeGrid earnedBadgeIds={earnedBadges} />
      </Section>

      {bests.length > 0 && (
        <Section title="Personal bests">
          <ul className="divide-y divide-bw-border-subtle">
            {bests.map(({ protocol, best }) => (
              <li key={protocol.id} className="flex items-baseline justify-between py-2">
                <span className="text-sm text-bw">{protocol.name}</span>
                <span className="text-sm font-medium tabular-nums text-bw">
                  {best!.maxHoldTime}s hold
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="History">
        <HistoryList sessions={sessions} />
      </Section>

      <section className="border-t border-bw-border pt-5">
        {confirmingClear ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-bw-secondary">
              Delete all {sessions.length} sessions? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={btnDestructive}
                onClick={() => {
                  clearHistory()
                  setConfirmingClear(false)
                }}
              >
                Delete history
              </button>
              <button type="button" className={btnSecondary} onClick={() => setConfirmingClear(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={btnSecondary} onClick={() => setConfirmingClear(true)}>
            Clear history
          </button>
        )}
      </section>
    </div>
  )
}
