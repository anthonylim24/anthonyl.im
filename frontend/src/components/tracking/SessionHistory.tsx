import { useNavigate } from 'react-router-dom'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { buildSessionRoutePath } from '@/lib/sessionRoutes'
import { formatDate, formatTime } from '@/lib/utils'
import type { CompletedSession } from '@/stores/historyStore'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Clock, RotateCcw, Trophy } from 'lucide-react'

interface SessionHistoryProps {
  sessions: CompletedSession[]
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}

function formatDurationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const parts: string[] = []

  if (minutes > 0) {
    parts.push(pluralize(minutes, 'minute'))
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(pluralize(remainingSeconds, 'second'))
  }

  return parts.join(' ')
}

function buildSessionLabel(session: CompletedSession): string {
  const protocol = breathingProtocols[session.techniqueId]
  const protocolName = protocol.name
  const parts = [
    protocolName,
    formatDate(new Date(session.date)),
    formatDurationLabel(session.durationSeconds),
    pluralize(session.rounds, 'round'),
  ]

  if (session.maxHoldTime > 0) {
    parts.push(
      `best hold ${pluralize(session.maxHoldTime, 'second')}`,
      `average hold ${pluralize(session.avgHoldTime, 'second')}`
    )
  }
  if (protocol.safetyChecklist?.length) {
    parts.push('safety check required before repeat')
  }

  return parts.join(', ')
}

function buildRepeatLabel(session: CompletedSession): string {
  const protocol = breathingProtocols[session.techniqueId]
  const protocolName = protocol.name
  const cadenceText = session.customPhaseDurations ? ', custom cadence' : ''
  const sessionDetail = `${protocolName}, ${formatDurationLabel(session.durationSeconds)}, ${pluralize(session.rounds, 'round')}${cadenceText}`

  if (protocol.safetyChecklist?.length) {
    return `Review safety check before repeating ${sessionDetail}`
  }

  return `Repeat ${sessionDetail}`
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  const navigate = useNavigate()

  if (sessions.length === 0) {
    return (
      <div className="py-10 text-center text-sm">
        <p className="text-bw-tertiary">Your session history will appear here after your first practice.</p>
        <button
          type="button"
          onClick={() => navigate('/breathwork/session?technique=box_breathing')}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-bw-secondary hover:text-bw transition-colors"
        >
          Start your first session &rarr;
        </button>
      </div>
    )
  }

  return (
    <div
      className="space-y-2"
      role="list"
      aria-label={`${sessions.length} completed session${sessions.length === 1 ? '' : 's'}`}
    >
      {sessions.map((session) => {
        const protocol = breathingProtocols[session.techniqueId]
        const requiresSafetyCheck = Boolean(protocol.safetyChecklist?.length)

        return (
          <div
            key={session.id}
            role="listitem"
            aria-label={buildSessionLabel(session)}
            className="flex min-w-0 max-w-full flex-wrap items-center gap-3 border-b border-bw-border py-3 hover:bg-bw-hover transition-colors duration-200 sm:flex-nowrap"
          >
            {/* Technique icon */}
            <div className="shrink-0">
              <TechniqueGeometryIcon techniqueId={session.techniqueId} className="text-bw-secondary" />
            </div>

            {/* Name + date */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-bw leading-tight truncate">
                {protocol.name}
              </div>
              <div className="text-xs text-bw-tertiary mt-0.5">
                {formatDate(new Date(session.date))}
              </div>
              {requiresSafetyCheck ? (
                <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                  Safety check
                </div>
              ) : null}
            </div>

            {/* Stats */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bw-tertiary tabular-nums sm:shrink-0">
              <span className="flex items-center gap-1" aria-label={formatDurationLabel(session.durationSeconds)}>
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatTime(session.durationSeconds)}
              </span>
              <span aria-label={pluralize(session.rounds, 'round')}>{session.rounds}r</span>
            </div>

            {/* Best hold (only for CO2 tolerance) */}
            {session.maxHoldTime > 0 && (
              <div className="min-w-0 shrink text-right pl-2 border-l border-bw-border sm:shrink-0">
                <div className="flex items-center gap-1 font-mono text-sm font-normal text-bw tabular-nums">
                  <Trophy className="h-3 w-3 text-bw-secondary" aria-hidden="true" />
                  {session.maxHoldTime}s
                </div>
                <div className="text-[10px] text-bw-tertiary tabular-nums">
                  avg {session.avgHoldTime}s
                </div>
              </div>
            )}

            <button
              type="button"
              aria-label={buildRepeatLabel(session)}
              onClick={() => navigate(buildSessionRoutePath(session))}
              className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center border border-bw-border text-bw-tertiary transition-colors hover:bg-bw-hover hover:text-bw"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
