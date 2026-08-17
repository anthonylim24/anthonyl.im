import { useMemo, useState } from 'react'
import { LayoutGroup } from 'motion/react'
import { Link } from 'react-router-dom'
import { InkChip } from '../motion/InkChip'
import type { TechniqueId } from '@/lib/constants'
import { formatMoodShift } from '@/lib/mood'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol, PROTOCOLS } from '../protocols/catalog'
import { buildRepeatParams, buildSessionPath } from '../session/urlParams'
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
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by technique">
            <InkChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
              layoutId="history-filter-ink"
              className="text-xs"
            />
            {techniquesInHistory.map((protocol) => (
              <InkChip
                key={protocol.id}
                active={filter === protocol.id}
                onClick={() => setFilter(protocol.id)}
                label={protocol.name}
                layoutId="history-filter-ink"
                className="text-xs"
              />
            ))}
          </div>
        </LayoutGroup>
      )}

      <ul className="divide-y divide-bw-border-subtle">
        {visible.map((session) => {
          const protocol = getProtocol(session.techniqueId)
          const moodShift = formatMoodShift(session.moodBefore, session.moodAfter)
          return (
            <li key={session.id} className="cv-row flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-bw">
                  {protocol.name}
                  {session.customPhaseDurations && (
                    <span className="ml-2 text-xs font-normal text-bw-tertiary">custom cadence</span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs tabular-nums text-bw-secondary">
                  {formatLocalDate(session.date)}, {formatLocalTime(session.date)}
                  {' · '}
                  {formatDuration(session.durationSeconds)}, {session.rounds} rounds
                  {session.maxHoldTime > 0 && ` · hold ${session.maxHoldTime}s`}
                </p>
                {moodShift && (
                  <p className="mt-0.5 text-xs text-bw-tertiary">{moodShift}</p>
                )}
              </div>
              <Link
                to={buildSessionPath(buildRepeatParams(session))}
                aria-label={`Repeat ${protocol.name} session`}
                className="inline-flex min-h-11 items-center px-2 text-xs text-bw-secondary transition-colors duration-150 hover:text-bw-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
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
          className="mt-2 min-h-11 w-full rounded-lg text-sm text-bw-secondary transition-colors duration-150 hover:bg-bw-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          Show more
        </button>
      )}
    </div>
  )
}

