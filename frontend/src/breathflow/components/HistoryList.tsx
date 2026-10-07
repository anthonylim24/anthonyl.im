import { useMemo, useState, type CSSProperties } from 'react'
import { LayoutGroup } from 'motion/react'
import { Link } from 'react-router-dom'
import { sx } from '@/styles/merge'
import { InkChip } from '../motion/InkChip'
import type { TechniqueId } from '@/lib/constants'
import { formatMoodShift } from '@/lib/mood'
import type { CompletedSession } from '@/stores/historyStore'
import { techniquePigment } from '../pigments'
import { getProtocol, PROTOCOLS } from '../protocols/catalog'
import { buildRepeatParams, buildSessionPath } from '../session/urlParams'
import { bf } from '../styles/breathflow.stylex'
import { pg } from '../styles/progress.stylex'
import { formatDuration, formatLocalDate, formatLocalTime } from './format'

interface HistoryListProps {
  sessions: readonly CompletedSession[]
}

const PAGE_SIZE = 12

/**
 * Filterable session history. Every row links back to a session with the
 * same technique, rounds, and custom cadence; advanced protocols are
 * re-gated by the safety checklist on the setup screen.
 */
export function HistoryList({ sessions }: HistoryListProps) {
  const [filter, setFilter] = useState<TechniqueId | 'all'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const techniquesInHistory = useMemo(() => {
    const seen = new Set(sessions.map((session) => session.techniqueId))
    return PROTOCOLS.filter((protocol) => seen.has(protocol.id))
  }, [sessions])

  const filtered = filter === 'all'
    ? sessions
    : sessions.filter((session) => session.techniqueId === filter)
  const visible = filtered.slice(0, visibleCount)

  return (
    <div>
      {techniquesInHistory.length > 1 && (
        <LayoutGroup id="history-filter">
          <div {...sx(bf.mb3, bf.flexWrapGap15)} role="group" aria-label="Filter by technique">
            <InkChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
              layoutId="history-filter-ink"
              compact
            />
            {techniquesInHistory.map((protocol) => (
              <InkChip
                key={protocol.id}
                active={filter === protocol.id}
                onClick={() => setFilter(protocol.id)}
                label={protocol.name}
                layoutId="history-filter-ink"
                compact
              />
            ))}
          </div>
        </LayoutGroup>
      )}

      <ul>
        {visible.map((session) => {
          const protocol = getProtocol(session.techniqueId)
          const moodShift = formatMoodShift(session.moodBefore, session.moodAfter)
          return (
            <li key={session.id} {...sx('cv-row', bf.historyRow)}>
              <span
                aria-hidden="true"
                {...sx('bf-dab', pg.dab)}
                style={{ '--bf-dab': techniquePigment(session.techniqueId).mass } as CSSProperties}
              />
              <div {...sx(bf.minW0, bf.flex1)}>
                <p {...sx(bf.truncate, bf.textSm, bf.fontMedium, bf.textBw)}>
                  {protocol.name}
                  {session.customPhaseDurations && (
                    <span {...sx(bf.ml2, bf.textXs, bf.fontNormal, bf.textTertiary)}>custom cadence</span>
                  )}
                </p>
                <p {...sx(bf.mt05, bf.truncate, bf.textXs, bf.tabularNums, bf.textSecondary)}>
                  {formatLocalDate(session.date)}, {formatLocalTime(session.date)}
                  {' · '}
                  {formatDuration(session.durationSeconds)}, {session.rounds} rounds
                  {session.maxHoldTime > 0 && ` · hold ${session.maxHoldTime}s`}
                </p>
                {moodShift && (
                  <p {...sx(bf.mt05, bf.textXs, bf.textTertiary)}>{moodShift}</p>
                )}
              </div>
              <Link
                to={buildSessionPath(buildRepeatParams(session))}
                aria-label={`Repeat ${protocol.name} session`}
                {...sx(bf.repeatLink)}
              >
                Repeat
              </Link>
            </li>
          )
        })}
      </ul>

      {filtered.length > visibleCount && (
        <button
          type="button"
          {...sx(bf.showMoreBtn)}
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          Show more
        </button>
      )}
    </div>
  )
}
