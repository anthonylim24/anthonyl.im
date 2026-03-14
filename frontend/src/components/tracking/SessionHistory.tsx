import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, formatTime } from '@/lib/utils'
import { ACHIEVEMENT } from '@/lib/palette'
import { techniqueGradientStyle } from '@/lib/techniqueConfig'
import type { CompletedSession } from '@/stores/historyStore'
import { Wind, Flame, Box, Clock, Trophy, Heart } from 'lucide-react'

interface SessionHistoryProps {
  sessions: CompletedSession[]
}

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-4 w-4" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-4 w-4" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-4 w-4" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-4 w-4" />,
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <div className="py-10 text-center text-white/30 surface-well rounded-[18px] text-sm">
        No sessions completed yet. Start your first breathing session!
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center gap-3 p-3.5 rounded-2xl surface-well hover:bg-white/[0.04] transition-colors duration-200"
        >
          {/* Technique icon */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={techniqueGradientStyle(session.techniqueId)}
          >
            <span className="text-white">{techniqueIcons[session.techniqueId]}</span>
          </div>

          {/* Name + date */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-white leading-tight truncate">
              {breathingProtocols[session.techniqueId].name}
            </div>
            <div className="text-xs text-white/30 mt-0.5">
              {formatDate(new Date(session.date))}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 shrink-0 text-xs text-white/35 tabular-nums">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(session.durationSeconds)}
            </span>
            <span>{session.rounds}r</span>
          </div>

          {/* Best hold (only for CO2 tolerance) */}
          {session.maxHoldTime > 0 && (
            <div className="shrink-0 text-right pl-2 border-l border-white/[0.06]">
              <div className="flex items-center gap-1 font-display text-sm font-bold text-white tabular-nums">
                <Trophy className="h-3 w-3" style={{ color: ACHIEVEMENT }} />
                {session.maxHoldTime}s
              </div>
              <div className="text-[10px] text-white/30 tabular-nums">
                avg {session.avgHoldTime}s
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
