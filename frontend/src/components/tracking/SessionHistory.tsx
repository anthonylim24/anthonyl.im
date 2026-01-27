import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, formatTime, cn } from '@/lib/utils'
import type { CompletedSession } from '@/stores/historyStore'
import { Wind, Flame, Box, Clock, Trophy } from 'lucide-react'

interface SessionHistoryProps {
  sessions: CompletedSession[]
}

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-5 w-5" />,
    gradient: 'from-[#60a5fa] to-[#818cf8]',
    glow: 'shadow-[#60a5fa]/30',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-5 w-5" />,
    gradient: 'from-[#fbbf24] to-[#f97316]',
    glow: 'shadow-[#fbbf24]/30',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-5 w-5" />,
    gradient: 'from-[#2dd4bf] to-[#22d3ee]',
    glow: 'shadow-[#2dd4bf]/30',
  },
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground bg-white/30 rounded-2xl">
        No sessions completed yet. Start your first breathing session!
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const config = techniqueConfig[session.techniqueId]
        return (
          <div
            key={session.id}
            className="p-4 bg-white/40 rounded-2xl group hover:bg-white/50 transition-all duration-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform duration-300 mt-0.5",
                  config.gradient,
                  config.glow
                )}>
                  <span className="text-white scale-90">{config.icon}</span>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-foreground">
                    {breathingProtocols[session.techniqueId].name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(new Date(session.date))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                  <div className="flex items-center gap-1.5 text-lg font-bold text-foreground">
                    <Trophy className="h-4 w-4 text-[#fbbf24]" />
                    {session.maxHoldTime}s
                  </div>
                  <div className="text-xs text-muted-foreground">
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
