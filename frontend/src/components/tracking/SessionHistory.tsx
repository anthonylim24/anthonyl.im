import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, formatTime } from '@/lib/utils'
import { ACHIEVEMENT } from '@/lib/palette'
import { techniqueGradientStyle } from '@/lib/techniqueConfig'
import type { CompletedSession } from '@/stores/historyStore'
import { Wind, Flame, Box, Clock, Trophy } from 'lucide-react'

interface SessionHistoryProps {
  sessions: CompletedSession[]
}

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <div className="py-8 text-center text-white/40 bg-white/5 rounded-2xl">
        No sessions completed yet. Start your first breathing session!
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        return (
          <div
            key={session.id}
            className="p-4 bg-white/5 rounded-2xl group hover:bg-white/10 transition-all duration-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 mt-0.5"
                  style={techniqueGradientStyle(session.techniqueId)}
                >
                  <span className="text-white scale-90">{techniqueIcons[session.techniqueId]}</span>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-white">
                    {breathingProtocols[session.techniqueId].name}
                  </div>
                  <div className="text-sm text-white/40">
                    {formatDate(new Date(session.date))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-white/40">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTime(session.durationSeconds)}
                    </span>
                    <span>{session.rounds} rounds</span>
                  </div>
                </div>
              </div>

              {session.maxHoldTime > 0 && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-lg font-bold text-white">
                    <Trophy className="h-4 w-4" style={{ color: ACHIEVEMENT }} />
                    {session.maxHoldTime}s
                  </div>
                  <div className="text-xs text-white/40">
                    Avg: {session.avgHoldTime}s
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
