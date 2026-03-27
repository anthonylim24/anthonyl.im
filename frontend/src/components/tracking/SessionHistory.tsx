import { useNavigate } from 'react-router-dom'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { formatDate, formatTime } from '@/lib/utils'
import type { CompletedSession } from '@/stores/historyStore'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Clock, Trophy } from 'lucide-react'

interface SessionHistoryProps {
  sessions: CompletedSession[]
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  const navigate = useNavigate()

  if (sessions.length === 0) {
    return (
      <div className="py-10 text-center text-sm">
        <p className="text-bw-tertiary font-mono">Your session history will appear here after your first practice.</p>
        <button
          onClick={() => navigate('/breathwork/session?technique=box_breathing')}
          className="mt-3 text-sm font-medium text-bw-secondary hover:text-bw transition-colors"
        >
          Start your first session &rarr;
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center gap-3 border-b border-bw-border py-3 hover:bg-bw-hover transition-colors duration-200"
        >
          {/* Technique icon */}
          <div className="shrink-0">
            <TechniqueGeometryIcon techniqueId={session.techniqueId} className="text-bw-secondary" />
          </div>

          {/* Name + date */}
          <div className="flex-1 min-w-0">
            <div className="font-mono font-medium text-sm text-bw leading-tight truncate">
              {breathingProtocols[session.techniqueId].name}
            </div>
            <div className="text-xs font-mono text-bw-tertiary mt-0.5">
              {formatDate(new Date(session.date))}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 shrink-0 text-xs text-bw-tertiary tabular-nums">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(session.durationSeconds)}
            </span>
            <span>{session.rounds}r</span>
          </div>

          {/* Best hold (only for CO2 tolerance) */}
          {session.maxHoldTime > 0 && (
            <div className="shrink-0 text-right pl-2 border-l border-bw-border">
              <div className="flex items-center gap-1 font-mono text-sm font-normal text-bw tabular-nums">
                <Trophy className="h-3 w-3 text-bw-secondary" />
                {session.maxHoldTime}s
              </div>
              <div className="text-[10px] text-bw-tertiary tabular-nums">
                avg {session.avgHoldTime}s
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
