import { Card, CardContent } from '@/components/ui/card'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, formatTime } from '@/lib/utils'
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
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No sessions completed yet. Start your first breathing session!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <Card key={session.id} className="session-history-item">
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="text-primary mt-0.5">
                  {techniqueIcons[session.techniqueId]}
                </div>
                <div className="space-y-1">
                  <div className="font-medium">
                    {breathingProtocols[session.techniqueId].name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(new Date(session.date))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(session.durationSeconds)}
                    </span>
                    <span>{session.rounds} rounds</span>
                  </div>
                </div>
              </div>

              {session.maxHoldTime > 0 && (
                <div className="text-right">
                  <div className="flex items-center gap-1 text-lg font-bold">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    {session.maxHoldTime}s
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg: {session.avgHoldTime}s
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
