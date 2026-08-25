import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { sx } from '@/styles/merge'
import { getAverageMoodShift } from '@/lib/mood'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { BadgeGrid } from '../components/BadgeGrid'
import { HistoryList } from '../components/HistoryList'
import { HoldChart } from '../components/HoldChart'
import { LevelRing } from '../components/LevelRing'
import { btn } from '../components/buttonStyles.stylex'
import { getWeekSummary } from '../gamify/practiceWeek'
import { getProtocol, PROTOCOLS } from '../protocols/catalog'
import { bf } from '../styles/breathflow.stylex'
import { buildSessionPath } from '../session/urlParams'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section {...sx(bf.sectionTight)}>
      <h2 {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{title}</h2>
      <div {...sx(bf.mt3)}>{children}</div>
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
  const confirmClearRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmingClear) confirmClearRef.current?.focus()
  }, [confirmingClear])

  const week = useMemo(() => getWeekSummary(sessions), [sessions])
  const moodTrend = useMemo(() => getAverageMoodShift(sessions), [sessions])
  const hasHoldSessions = sessions.some((session) => session.maxHoldTime > 0)
  const bests = PROTOCOLS
    .map((protocol) => ({ protocol, best: personalBests[protocol.id] }))
    .filter((entry) => entry.best && entry.best.maxHoldTime > 0)

  if (sessions.length === 0) {
    return (
      <div {...sx(bf.flexColStart, bf.pt10)}>
        <h1 {...sx('bf-display', bf.text3xl, bf.trackingTight, bf.textBw)}>Progress</h1>
        <p {...sx(bf.textSm, bf.textSecondary)}>No sessions yet.</p>
        <p {...sx(bf.maxWSm, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>
          Complete your first session and your practice, streaks, and holds
          will build up here.
        </p>
        <Link
          to={buildSessionPath({ techniqueId: 'box_breathing', rounds: getProtocol('box_breathing').defaultRounds })}
          {...sx(btn.base, btn.primary)}
        >
          Start Box Breathing
        </Link>
      </div>
    )
  }

  const weekTopProtocol = week.topTechniqueId ? getProtocol(week.topTechniqueId) : null

  return (
    <div {...sx(bf.spaceY6, bf.pb8)}>
      <div>
        <h1 {...sx('bf-display', bf.text3xl, bf.trackingTight, bf.textBw)}>Progress</h1>

        <p {...sx(bf.mt4, bf.maxWLg, bf.textLg, bf.leadingRelaxed, bf.trackingTight, bf.textBw)}>
          {week.activeDays === 0
            ? 'Nothing logged in the last seven days.'
            : `${week.activeDays} active ${week.activeDays === 1 ? 'day' : 'days'} this week: ${week.minutes} ${week.minutes === 1 ? 'minute' : 'minutes'} across ${week.sessionCount} ${week.sessionCount === 1 ? 'session' : 'sessions'}${weekTopProtocol ? `, mostly ${weekTopProtocol.name}` : ''}.`}
        </p>
        <p {...sx(bf.mt2, bf.textSm, bf.textSecondary)}>
          {week.nextStep}
          {week.performanceNote ? ` ${week.performanceNote}` : ''}
        </p>
      </div>

      {moodTrend && (
        <Section title="Calm shift">
          <p {...sx(bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>
            Across {moodTrend.count} rated {moodTrend.count === 1 ? 'session' : 'sessions'}, your calm
            moved {moodTrend.averageShift >= 0 ? 'up' : 'down'} an average of{' '}
            <span {...sx(bf.fontMedium, bf.tabularNums, bf.textBw)}>{Math.abs(moodTrend.averageShift)}</span>{' '}
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
          <ul>
            {bests.map(({ protocol, best }) => (
              <li key={protocol.id} {...sx(bf.pbRow)}>
                <span {...sx(bf.textSm, bf.textBw)}>{protocol.name}</span>
                <span {...sx(bf.textSm, bf.fontMedium, bf.tabularNums, bf.textBw)}>
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

      <section {...sx(bf.sectionTight)}>
        {confirmingClear ? (
          <div {...sx(bf.flexColGap2SmRow)}>
            <p role="status" aria-live="polite" aria-atomic="true" {...sx(bf.flex1, bf.textSm, bf.textSecondary)}>
              Delete all {sessions.length} sessions? This cannot be undone.
            </p>
            <div {...sx(bf.flexItemsCenterGap2)}>
              <button
                ref={confirmClearRef}
                type="button"
                {...sx(btn.base, btn.destructive)}
                onClick={() => {
                  clearHistory()
                  setConfirmingClear(false)
                }}
              >
                Delete history
              </button>
              <button type="button" {...sx(btn.base, btn.secondary)} onClick={() => setConfirmingClear(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" {...sx(btn.base, btn.secondary)} onClick={() => setConfirmingClear(true)}>
            Clear history
          </button>
        )}
      </section>
    </div>
  )
}
